package main

import (
	"context"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log/slog"
	"mime"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	cookieName = "natel_session"
	// Over HTTPS: a sibling subdomain can't set a cookie with this prefix,
	// so it can't slip its own session in front of the user's.
	secureCookieName = "__Host-" + cookieName
	maxBodySize      = 4 << 10
	signInTimeout    = 30 * time.Second
	secretHeader     = "Natel-Session-Secret"
)

type server struct {
	store    *store
	verifier *verifier
	log      *slog.Logger
	// secret is what Caddy sends /auth, so a local process that got hold of
	// a session cookie can't read the password from the loopback.
	secret string
}

// routes is what Caddy reaches on the loopback: /session through its
// reverse_proxy, /auth through forward_auth before every /dav request.
func (s *server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /session", s.signIn)
	mux.HandleFunc("GET /session", s.current)
	mux.HandleFunc("DELETE /session", s.signOut)
	mux.HandleFunc("GET /auth", s.authorize)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	return s.recoverPanics(noStore(mux))
}

type credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type signedIn struct {
	Username string `json:"username"`
}

func (s *server) signIn(w http.ResponseWriter, r *http.Request) {
	if !sameOrigin(r) {
		s.log.Warn("sign-in refused: the request doesn't come from Natel's own page")
		w.WriteHeader(http.StatusForbidden)
		return
	}
	// JSON only: a cross-site form can't send it without a CORS preflight.
	if media, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type")); media != "application/json" {
		w.WriteHeader(http.StatusUnsupportedMediaType)
		return
	}
	var creds credentials
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodySize)).Decode(&creds); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			w.WriteHeader(http.StatusRequestEntityTooLarge)
			return
		}
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	// Basic auth can't carry a colon in the username.
	if creds.Username == "" || creds.Password == "" || strings.Contains(creds.Username, ":") {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	authorization := "Basic " + base64.StdEncoding.EncodeToString([]byte(creds.Username+":"+creds.Password))

	if s.verifier == nil {
		s.log.Error("sign-in impossible: CARDDAV_URL is not set")
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), signInTimeout)
	defer cancel()
	switch err := s.verifier.verify(ctx, authorization, r.Header.Get("X-Forwarded-For")); {
	case errors.Is(err, errRejected):
		s.log.Info("sign-in rejected by the CardDAV server")
		w.WriteHeader(http.StatusUnauthorized)
		return
	case errors.Is(err, errUnreachable):
		s.log.Warn("sign-in failed: CardDAV server unreachable")
		w.WriteHeader(http.StatusBadGateway)
		return
	case err != nil:
		s.log.Warn("sign-in failed: CardDAV server gave no DAV answer")
		w.WriteHeader(http.StatusBadGateway)
		return
	}

	name := cookieName
	if secure(r) {
		name = secureCookieName
	}
	token, err := s.store.open(creds.Username, authorization, name)
	// Not a 503: the app would report the CardDAV server as unreachable.
	if errors.Is(err, errFull) {
		s.log.Warn("sign-in refused: session limit reached")
		w.WriteHeader(http.StatusTooManyRequests)
		return
	}
	if err != nil {
		s.log.Error("sign-in failed: no session token", "error", err.Error())
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	setCookie(w, name, token, int(maxLifetime/time.Second))
	writeJSON(w, signedIn{Username: creds.Username})
}

func (s *server) current(w http.ResponseWriter, r *http.Request) {
	sess, ok := s.lookup(r)
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	writeJSON(w, signedIn{Username: sess.username})
}

func (s *server) signOut(w http.ResponseWriter, r *http.Request) {
	if !sameOrigin(r) {
		w.WriteHeader(http.StatusForbidden)
		return
	}
	if token, _, ok := sessionToken(r); ok {
		s.store.close(token)
	}
	for _, name := range []string{secureCookieName, cookieName} {
		setCookie(w, name, "", -1)
	}
	w.WriteHeader(http.StatusNoContent)
}

// authorize answers forward_auth: a live session gets the Authorization
// header Caddy copies onto the request to the CardDAV server.
func (s *server) authorize(w http.ResponseWriter, r *http.Request) {
	if subtle.ConstantTimeCompare([]byte(r.Header.Get(secretHeader)), []byte(s.secret)) != 1 {
		// Caddy's config lost the secret, as a caddy reload from outside
		// natel-session leaves it: every /dav request fails until a restart.
		s.log.Warn("credentials refused: the request doesn't carry Caddy's secret")
		w.WriteHeader(http.StatusForbidden)
		return
	}
	sess, ok := s.lookup(r)
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	w.Header().Set("Authorization", sess.authorization)
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) lookup(r *http.Request) (session, bool) {
	token, name, ok := sessionToken(r)
	if !ok {
		return session{}, false
	}
	return s.store.get(token, name)
}

// sessionToken reads the session cookie, the __Host- one first. Two
// cookies of the same name mean another one was slipped in: neither counts.
func sessionToken(r *http.Request) (token, name string, ok bool) {
	for _, name := range []string{secureCookieName, cookieName} {
		cookies := r.CookiesNamed(name)
		if len(cookies) == 1 {
			return cookies[0].Value, name, true
		}
		if len(cookies) > 1 {
			return "", "", false
		}
	}
	return "", "", false
}

// secure tells whether the browser reached Natel over HTTPS. Caddy's view
// comes first: a client chooses its Origin, and an http one would get it a
// plain cookie to slip into a browser. Behind a reverse proxy that
// terminates TLS, Caddy may only have seen HTTP: the page's Origin decides.
func secure(r *http.Request) bool {
	if r.Header.Get("X-Forwarded-Proto") == "https" {
		return true
	}
	origin, err := url.Parse(r.Header.Get("Origin"))
	return err == nil && origin.Scheme == "https"
}

// sameOrigin tells whether the request comes from Natel's own page. A
// browser says so in Sec-Fetch-Site, which no page can set, whatever Host
// a reverse proxy passes on. Without it, an older browser's Origin must
// name the host Natel is reached at.
func sameOrigin(r *http.Request) bool {
	if site := r.Header.Get("Sec-Fetch-Site"); site != "" {
		return site == "same-origin"
	}
	origin, err := url.Parse(r.Header.Get("Origin"))
	if err != nil || origin.Host == "" || (origin.Scheme != "http" && origin.Scheme != "https") {
		return false
	}
	host := r.Header.Get("X-Forwarded-Host")
	if host == "" {
		host = r.Host
	}
	return strings.EqualFold(origin.Host, host)
}

// setCookie scopes the session cookie to this host and keeps it from page
// scripts and from requests other sites start. Only the __Host- name is
// Secure: over plain HTTP, the browser would drop a Secure cookie.
func setCookie(w http.ResponseWriter, name, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   name == secureCookieName,
		SameSite: http.SameSiteStrictMode,
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func noStore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

// recoverPanics answers a 500 instead of dropping the connection, and logs
// no request data.
func (s *server) recoverPanics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				if v == http.ErrAbortHandler {
					panic(v)
				}
				s.log.Error("request handler panicked", "path", r.URL.Path)
				w.WriteHeader(http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}
