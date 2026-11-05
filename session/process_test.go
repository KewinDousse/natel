//go:build unix

package main

import (
	"bytes"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

func TestChildExitCodeIsKept(t *testing.T) {
	p, err := start([]string{"sh", "-c", "exit 3"})
	if err != nil {
		t.Fatal(err)
	}
	select {
	case code := <-p.exited:
		if code != 3 {
			t.Fatalf("exit code %d", code)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("child exit not seen")
	}
}

func TestSignalsReachTheChild(t *testing.T) {
	ready := filepath.Join(t.TempDir(), "ready")
	p, err := start([]string{"sh", "-c", "trap 'exit 7' TERM; touch \"$0\"; while :; do sleep 0.05; done", ready})
	if err != nil {
		t.Fatal(err)
	}
	waitForFile(t, ready)
	p.signal(syscall.SIGTERM)
	select {
	case code := <-p.exited:
		if code != 7 {
			t.Fatalf("exit code %d", code)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("child didn't stop")
	}
}

func TestStopKillsAChildThatIgnoresTerm(t *testing.T) {
	timeout := stopTimeout
	stopTimeout = 100 * time.Millisecond
	t.Cleanup(func() { stopTimeout = timeout })
	var logs bytes.Buffer
	ready := filepath.Join(t.TempDir(), "ready")
	p, err := start([]string{"sh", "-c", "trap '' TERM; touch \"$0\"; while :; do sleep 0.05; done", ready})
	if err != nil {
		t.Fatal(err)
	}
	waitForFile(t, ready)
	p.stop(newLogger(&logs))
	if !bytes.Contains(logs.Bytes(), []byte("killed")) {
		t.Fatalf("logs:\n%s", logs.String())
	}
}

func TestRunExitsWithTheChildsCode(t *testing.T) {
	t.Setenv("NATEL_SESSION_ADDR", "127.0.0.1:0")
	t.Setenv("CARDDAV_URL", "")
	var logs bytes.Buffer
	if code := run(newLogger(&logs), []string{"sh", "-c", "exit 4"}); code != 4 {
		t.Fatalf("exit code %d\n%s", code, logs.String())
	}
	if !bytes.Contains(logs.Bytes(), []byte(`"code":4`)) {
		t.Fatalf("logs:\n%s", logs.String())
	}
}

func TestRunRefusesABadServerURL(t *testing.T) {
	t.Setenv("NATEL_SESSION_ADDR", "127.0.0.1:0")
	t.Setenv("CARDDAV_URL", "https://dav.example.com/dav.php")
	if code := run(newLogger(io.Discard), []string{"true"}); code != 1 {
		t.Fatalf("exit code %d", code)
	}
}

func TestRunNeedsACommand(t *testing.T) {
	t.Setenv("NATEL_SESSION_ADDR", "127.0.0.1:0")
	if code := run(newLogger(io.Discard), nil); code != 1 {
		t.Fatalf("exit code %d", code)
	}
}

// docker stop sends SIGTERM to natel-session: Caddy gets it and its exit
// code becomes the container's. A SIGHUP reaches Caddy without stopping
// anything.
func TestRunForwardsSignalsToTheChild(t *testing.T) {
	t.Setenv("NATEL_SESSION_ADDR", "127.0.0.1:0")
	t.Setenv("CARDDAV_URL", "")
	logs := &lockedBuffer{}
	ready := filepath.Join(t.TempDir(), "ready")
	done := make(chan int, 1)
	go func() {
		done <- run(newLogger(logs), []string{"sh", "-c", "trap '' HUP; trap 'exit 9' TERM; touch \"$0\"; while :; do sleep 0.05; done", ready})
	}()
	// natel-session's handlers were set before it started the child.
	waitForFile(t, ready)
	if err := syscall.Kill(os.Getpid(), syscall.SIGHUP); err != nil {
		t.Fatal(err)
	}
	time.Sleep(200 * time.Millisecond)
	select {
	case code := <-done:
		t.Fatalf("SIGHUP stopped natel-session with %d", code)
	default:
	}
	if err := syscall.Kill(os.Getpid(), syscall.SIGTERM); err != nil {
		t.Fatal(err)
	}
	select {
	case code := <-done:
		if code != 9 {
			t.Fatalf("exit code %d\n%s", code, logs.String())
		}
	case <-time.After(5 * time.Second):
		t.Fatal("SIGTERM didn't stop the child")
	}
}

func TestParseUpstreamReadsCardDAVURLAsCaddyDoes(t *testing.T) {
	for raw, want := range map[string]string{
		"https://dav.example.com": "https://dav.example.com",
		"http://127.0.0.1:5299/":  "http://127.0.0.1:5299/",
		"dav.example.com:443":     "http://dav.example.com:443",
		"127.0.0.1:5299":          "http://127.0.0.1:5299",
	} {
		got, err := parseUpstream(raw)
		if err != nil || got.String() != want {
			t.Errorf("%s: %v %v", raw, got, err)
		}
	}
	for _, raw := range []string{"dav.example.com/dav.php", "ftp://dav.example.com", "https://"} {
		if _, err := parseUpstream(raw); err == nil {
			t.Errorf("%s accepted", raw)
		}
	}
}

// waitForFile waits for the child to create path, once its traps are set.
func waitForFile(t *testing.T, path string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		if _, err := os.Stat(path); err == nil {
			return
		}
		if time.Now().After(deadline) {
			t.Fatal("the child didn't start")
		}
		time.Sleep(20 * time.Millisecond)
	}
}

// lockedBuffer lets a test read the logs run writes from another goroutine.
type lockedBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *lockedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *lockedBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

func TestSessionAddressStaysOnTheLoopback(t *testing.T) {
	for addr, want := range map[string]bool{
		"127.0.0.1:2020": true,
		"[::1]:2020":     true,
		"localhost:2020": true,
		":2020":          false,
		"0.0.0.0:2020":   false,
		"10.0.0.5:2020":  false,
		"127.0.0.1":      false,
	} {
		if got := loopback(addr); got != want {
			t.Errorf("%s: %v", addr, got)
		}
	}
}

func TestPipesAreNotTerminals(t *testing.T) {
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	defer w.Close()
	if isTerminal(r) {
		t.Fatal("a pipe counted as a terminal")
	}
}

func TestBoolEnv(t *testing.T) {
	for _, tc := range []struct {
		raw                string
		fallback, want, ok bool
	}{
		{raw: "", fallback: false, want: false, ok: true},
		{raw: "", fallback: true, want: true, ok: true},
		{raw: "true", fallback: false, want: true, ok: true},
		{raw: "false", fallback: true, want: false, ok: true},
		{raw: "tru", fallback: true, want: false, ok: false},
	} {
		t.Setenv("NATEL_TEST_BOOL", tc.raw)
		got, ok := boolEnv(newLogger(io.Discard), "NATEL_TEST_BOOL", tc.fallback)
		if got != tc.want || ok != tc.ok {
			t.Fatalf("%q with fallback %v: got %v, %v", tc.raw, tc.fallback, got, ok)
		}
	}
}

func TestRunAppliesHTTPSOnlyCookieSetting(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := listener.Addr().String()
	listener.Close()
	t.Setenv("NATEL_SESSION_ADDR", addr)
	t.Setenv("NATEL_SESSION_SECRET", testSecret)
	t.Setenv("CARDDAV_URL", fakeDav(t).URL)
	t.Setenv("NATEL_HTTPS_ONLY_COOKIE", "true")
	logs := &lockedBuffer{}
	ready := filepath.Join(t.TempDir(), "ready")
	done := make(chan int, 1)
	go func() {
		done <- run(newLogger(logs), []string{"sh", "-c", "trap 'exit 0' TERM; touch \"$0\"; while :; do sleep 0.05; done", ready})
	}()
	waitForFile(t, ready)
	defer func() {
		if err := syscall.Kill(os.Getpid(), syscall.SIGTERM); err != nil {
			t.Error(err)
			return
		}
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			t.Error("SIGTERM didn't stop the child")
		}
	}()

	r, err := http.NewRequest("POST", "http://"+addr+"/session", strings.NewReader(`{"username":"alice","password":"secret"}`))
	if err != nil {
		t.Fatal(err)
	}
	r.Header.Set("Origin", "http://"+addr)
	r.Header.Set("Sec-Fetch-Site", "same-origin")
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-Forwarded-Proto", "http")
	w, err := http.DefaultClient.Do(r)
	if err != nil {
		t.Fatal(err)
	}
	defer w.Body.Close()
	cookies := w.Cookies()
	if w.StatusCode != http.StatusOK || len(cookies) != 1 || cookies[0].Name != secureCookieName {
		t.Fatalf("sign-in: %d, cookies %+v\n%s", w.StatusCode, cookies, logs.String())
	}
}

func TestRunRefusesInvalidHTTPSOnlyCookieSetting(t *testing.T) {
	t.Setenv("NATEL_HTTPS_ONLY_COOKIE", "tru")
	var logs bytes.Buffer
	if code := run(newLogger(&logs), []string{"true"}); code != 1 {
		t.Fatalf("exit code %d", code)
	}
	if !bytes.Contains(logs.Bytes(), []byte("NATEL_HTTPS_ONLY_COOKIE must be true or false")) {
		t.Fatalf("logs: %s", logs.String())
	}
}
