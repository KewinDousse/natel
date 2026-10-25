//go:build unix

// natel-session holds Natel's sign-in sessions in memory (ADR 032). It is
// the container's entrypoint: it serves sessions to Caddy on the loopback
// and runs Caddy, the command it is given, as its child.
package main

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const defaultAddr = "127.0.0.1:2020"

func main() {
	log := newLogger(os.Stdout)
	os.Exit(run(log, os.Args[1:]))
}

func run(log *slog.Logger, command []string) int {
	updatesEnabled := true
	if raw := os.Getenv("NATEL_UPDATE_CHECKS"); raw != "" {
		var err error
		updatesEnabled, err = strconv.ParseBool(raw)
		if err != nil {
			log.Error("NATEL_UPDATE_CHECKS must be true or false")
			return 1
		}
	}
	addr := os.Getenv("NATEL_SESSION_ADDR")
	if addr == "" {
		addr = defaultAddr
	}
	if !loopback(addr) {
		log.Error("NATEL_SESSION_ADDR is not a loopback address with a port, such as 127.0.0.1:2020")
		return 1
	}
	var v *verifier
	if raw := os.Getenv("CARDDAV_URL"); raw != "" {
		upstream, err := parseUpstream(raw)
		if err != nil {
			log.Error("CARDDAV_URL is not an origin such as https://dav.example.com")
			return 1
		}
		v = newVerifier(upstream)
	}

	if len(command) == 0 {
		log.Error("no command to run: natel-session runs Caddy, as in caddy run --config …")
		return 1
	}
	secret := os.Getenv("NATEL_SESSION_SECRET")
	if secret == "" {
		var err error
		if secret, err = randomToken(); err != nil {
			log.Error("no secret for Caddy", "error", err.Error())
			return 1
		}
		// Caddy reads it from its environment, in the Caddyfile.
		if err := os.Setenv("NATEL_SESSION_SECRET", secret); err != nil {
			log.Error("no secret for Caddy", "error", err.Error())
			return 1
		}
	}

	listener, err := net.Listen("tcp", addr)
	if err != nil {
		log.Error("session server can't listen", "address", addr, "error", err.Error())
		return 1
	}
	st := newStore(time.Now)
	srv := &http.Server{
		Handler:           (&server{store: st, verifier: v, log: log, secret: secret, updateChecker: newUpdateChecker(updatesEnabled)}).routes(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		ErrorLog:          slog.NewLogLogger(log.Handler(), slog.LevelWarn),
	}
	served := make(chan error, 1)
	go func() { served <- srv.Serve(listener) }()
	log.Info("session server listening", "address", addr)

	stopSweeping := sweepEvery(st, time.Minute)
	defer stopSweeping()

	// On a terminal, Ctrl-C and Ctrl-\ reach Caddy too, which shares its
	// process group: forwarding them again would make Caddy force-quit.
	onTerminal := isTerminal(os.Stdin)
	stops := make(chan os.Signal, 1)
	signal.Notify(stops, syscall.SIGTERM, syscall.SIGINT, syscall.SIGQUIT)
	defer signal.Stop(stops)
	// Left to Go, these would end natel-session at once; Caddy handles or
	// ignores them itself.
	others := make(chan os.Signal, 1)
	signal.Notify(others, syscall.SIGHUP, syscall.SIGUSR1, syscall.SIGUSR2)
	defer signal.Stop(others)

	child, err := start(command)
	if err != nil {
		log.Error("can't start the child process", "command", command[0], "error", err.Error())
		shutdown(log, srv)
		return 1
	}
	log.Info("child process started", "command", command[0], "pid", child.proc.Pid)

	for {
		select {
		case sig := <-stops:
			log.Info("stopping", "signal", sig.String())
			if !onTerminal || sig == syscall.SIGTERM {
				child.signal(sig)
			}
		case sig := <-others:
			child.signal(sig)
		case code := <-child.exited:
			log.Info("child process exited", "code", code)
			shutdown(log, srv)
			return code
		case err := <-served:
			log.Error("session server stopped", "error", err.Error())
			child.stop(log)
			return 1
		}
	}
}

// loopback keeps natel-session off the network, and gives the healthcheck
// a host to reach.
func loopback(addr string) bool {
	host, port, err := net.SplitHostPort(addr)
	if err != nil || port == "" {
		return false
	}
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func shutdown(log *slog.Logger, srv *http.Server) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Warn("session server shutdown incomplete", "error", err.Error())
	}
}

func sweepEvery(st *store, every time.Duration) func() {
	ticker := time.NewTicker(every)
	done := make(chan struct{})
	go func() {
		for {
			select {
			case <-ticker.C:
				st.sweep()
			case <-done:
				return
			}
		}
	}()
	return func() {
		ticker.Stop()
		close(done)
	}
}

// newLogger writes JSON lines with Caddy's keys, so the container's output
// reads as one stream: level, ts in seconds, logger, msg.
func newLogger(out io.Writer) *slog.Logger {
	handler := slog.NewJSONHandler(out, &slog.HandlerOptions{
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			if len(groups) > 0 {
				return a
			}
			switch a.Key {
			case slog.TimeKey:
				t := a.Value.Time()
				return slog.Float64("ts", float64(t.UnixNano())/1e9)
			case slog.LevelKey:
				return slog.String("level", levelName(a.Value.Any().(slog.Level)))
			}
			return a
		},
	})
	return slog.New(handler).With("logger", "natel-session")
}

func levelName(level slog.Level) string {
	switch {
	case level >= slog.LevelError:
		return "error"
	case level >= slog.LevelWarn:
		return "warn"
	case level >= slog.LevelInfo:
		return "info"
	default:
		return "debug"
	}
}

// parseUpstream reads CARDDAV_URL as Caddy's reverse_proxy does: without a
// scheme, HTTP, port 443 included.
func parseUpstream(raw string) (*url.URL, error) {
	if !strings.Contains(raw, "://") {
		raw = "http://" + raw
	}
	upstream, err := url.Parse(raw)
	if err != nil {
		return nil, err
	}
	if (upstream.Scheme != "http" && upstream.Scheme != "https") || upstream.Host == "" ||
		(upstream.Path != "" && upstream.Path != "/") {
		return nil, errors.New("not an origin")
	}
	return upstream, nil
}
