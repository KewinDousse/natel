package main

import (
	"bytes"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

const (
	appOrigin  = "http://natel.test"
	testSecret = "caddy-secret"
)

// authRequest is Caddy's forward_auth request, with the secret it shares
// with natel-session.
func authRequest() *http.Request {
	r := httptest.NewRequest("GET", "/auth", nil)
	r.Header.Set(secretHeader, testSecret)
	return r
}

// fakeDav accepts alice:secret on /dav.php/ only, as a Baïkal without a
// well-known redirect would.
func fakeDav(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "PROPFIND" {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if r.URL.Path != "/dav.php/" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if r.Header.Get("Authorization") != basic("alice", "secret") {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusMultiStatus)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func basic(user, password string) string {
	return "Basic " + base64.StdEncoding.EncodeToString([]byte(user+":"+password))
}

func newTestServer(t *testing.T, upstream string, logs io.Writer) http.Handler {
	t.Helper()
	var v *verifier
	if upstream != "" {
		u, _ := url.Parse(upstream)
		v = newVerifier(u)
	}
	return (&server{store: newStore(time.Now), verifier: v, log: newLogger(logs), secret: testSecret}).routes()
}

func signInRequest(body string) *http.Request {
	r := httptest.NewRequest("POST", "/session", strings.NewReader(body))
	r.Host = "natel.test"
	r.Header.Set("Origin", appOrigin)
	r.Header.Set("Content-Type", "application/json")
	return r
}

func serve(h http.Handler, r *http.Request) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func sessionCookie(t *testing.T, w *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	for _, c := range w.Result().Cookies() {
		if c.Name == cookieName || c.Name == secureCookieName {
			return c
		}
	}
	t.Fatal("no session cookie")
	return nil
}

func withCookie(r *http.Request, c *http.Cookie) *http.Request {
	r.AddCookie(&http.Cookie{Name: c.Name, Value: c.Value})
	return r
}

func TestSignInOpensASessionThatAuthorizesDav(t *testing.T) {
	h := newTestServer(t, fakeDav(t).URL, io.Discard)
	w := serve(h, signInRequest(`{"username":"alice","password":"secret"}`))
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"username":"alice"`) {
		t.Fatalf("sign-in: %d %s", w.Code, w.Body)
	}
	c := sessionCookie(t, w)
	if !c.HttpOnly || c.SameSite != http.SameSiteStrictMode || c.Path != "/" || c.Secure {
		t.Fatalf("cookie attributes: %+v", c)
	}
	if c.MaxAge != int(maxLifetime/time.Second) {
		t.Fatalf("cookie lasts %d s", c.MaxAge)
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("a session answer may be cached")
	}

	auth := serve(h, withCookie(authRequest(), c))
	if auth.Code != http.StatusNoContent || auth.Header().Get("Authorization") != basic("alice", "secret") {
		t.Fatalf("auth: %d %q", auth.Code, auth.Header().Get("Authorization"))
	}
	current := serve(h, withCookie(httptest.NewRequest("GET", "/session", nil), c))
	if current.Code != http.StatusOK || !strings.Contains(current.Body.String(), `"username":"alice"`) {
		t.Fatalf("current: %d %s", current.Code, current.Body)
	}
}

func TestSignInOverHTTPSSetsASecureCookie(t *testing.T) {
	h := newTestServer(t, fakeDav(t).URL, io.Discard)
	// Behind a proxy that terminates TLS, Caddy may forward plain HTTP.
	r := signInRequest(`{"username":"alice","password":"secret"}`)
	r.Header.Set("X-Forwarded-Proto", "http")
	r.Header.Set("Origin", "https://natel.test")
	if c := sessionCookie(t, serve(h, r)); !c.Secure || c.Name != secureCookieName {
		t.Fatalf("cookie over HTTPS: %+v", c)
	}
}

func TestSignInRejectsWrongCredentials(t *testing.T) {
	h := newTestServer(t, fakeDav(t).URL, io.Discard)
	w := serve(h, signInRequest(`{"username":"alice","password":"wrong"}`))
	if w.Code != http.StatusUnauthorized || len(w.Result().Cookies()) != 0 {
		t.Fatalf("got %d with cookies %v", w.Code, w.Result().Cookies())
	}
	if w.Header().Get("WWW-Authenticate") != "" {
		t.Fatal("a challenge would open the browser's own prompt")
	}
}

func TestSignInRefusesOtherOriginsAndBodies(t *testing.T) {
	h := newTestServer(t, fakeDav(t).URL, io.Discard)
	cases := map[string]struct {
		edit func(*http.Request)
		body string
		want int
	}{
		"other origin": {func(r *http.Request) { r.Header.Set("Origin", "http://evil.test") }, "", http.StatusForbidden},
		"no origin":    {func(r *http.Request) { r.Header.Del("Origin") }, "", http.StatusForbidden},
		"other port":   {func(r *http.Request) { r.Header.Set("Origin", "http://natel.test:8443") }, "", http.StatusForbidden},
		"null origin":  {func(r *http.Request) { r.Header.Set("Origin", "null") }, "", http.StatusForbidden},
		"forwarded":    {func(r *http.Request) { r.Header.Set("X-Forwarded-Host", "proxy.test") }, "", http.StatusForbidden},
		"form":         {func(r *http.Request) { r.Header.Set("Content-Type", "application/x-www-form-urlencoded") }, "", http.StatusUnsupportedMediaType},
		"not json":     {func(*http.Request) {}, "username=alice", http.StatusBadRequest},
		"too large":    {func(*http.Request) {}, `{"username":"alice","password":"` + strings.Repeat("x", maxBodySize) + `"}`, http.StatusRequestEntityTooLarge},
		"empty":        {func(*http.Request) {}, `{"username":"","password":""}`, http.StatusBadRequest},
		"colon":        {func(*http.Request) {}, `{"username":"a:b","password":"secret"}`, http.StatusBadRequest},
	}
	for name, tc := range cases {
		body := tc.body
		if body == "" {
			body = `{"username":"alice","password":"secret"}`
		}
		r := signInRequest(body)
		tc.edit(r)
		if w := serve(h, r); w.Code != tc.want {
			t.Errorf("%s: got %d, want %d", name, w.Code, tc.want)
		}
	}
}

func TestSignInReportsAnUnreachableServer(t *testing.T) {
	dead := httptest.NewServer(http.NotFoundHandler())
	dead.Close()
	h := newTestServer(t, dead.URL, io.Discard)
	if w := serve(h, signInRequest(`{"username":"alice","password":"secret"}`)); w.Code != http.StatusBadGateway {
		t.Fatalf("got %d", w.Code)
	}
}

func TestSignInWithoutAServerIsUnavailable(t *testing.T) {
	h := newTestServer(t, "", io.Discard)
	if w := serve(h, signInRequest(`{"username":"alice","password":"secret"}`)); w.Code != http.StatusServiceUnavailable {
		t.Fatalf("got %d", w.Code)
	}
}

func TestSignOutEndsTheSession(t *testing.T) {
	h := newTestServer(t, fakeDav(t).URL, io.Discard)
	c := sessionCookie(t, serve(h, signInRequest(`{"username":"alice","password":"secret"}`)))

	foreign := withCookie(httptest.NewRequest("DELETE", "/session", nil), c)
	foreign.Host = "natel.test"
	foreign.Header.Set("Origin", "http://evil.test")
	if w := serve(h, foreign); w.Code != http.StatusForbidden {
		t.Fatalf("sign-out from another origin: %d", w.Code)
	}

	r := withCookie(httptest.NewRequest("DELETE", "/session", nil), c)
	r.Host = "natel.test"
	r.Header.Set("Origin", appOrigin)
	w := serve(h, r)
	if w.Code != http.StatusNoContent || sessionCookie(t, w).MaxAge >= 0 {
		t.Fatalf("sign-out: %d, cookie %+v", w.Code, sessionCookie(t, w))
	}
	if w := serve(h, withCookie(authRequest(), c)); w.Code != http.StatusUnauthorized {
		t.Fatalf("auth after sign-out: %d", w.Code)
	}
}

func TestAuthWithoutASessionGivesNoAuthorization(t *testing.T) {
	h := newTestServer(t, fakeDav(t).URL, io.Discard)
	for _, r := range []*http.Request{
		authRequest(),
		withCookie(authRequest(), &http.Cookie{Name: cookieName, Value: "forged"}),
	} {
		w := serve(h, r)
		if w.Code != http.StatusUnauthorized || w.Header().Get("Authorization") != "" {
			t.Fatalf("got %d with %q", w.Code, w.Header().Get("Authorization"))
		}
		// Caddy sets its own on /dav: a second copy would add to it.
		if w.Header().Get("X-Content-Type-Options") != "" {
			t.Fatal("the 401 carries X-Content-Type-Options")
		}
	}
}

func TestLogsHoldNoPrivateData(t *testing.T) {
	var logs bytes.Buffer
	h := newTestServer(t, fakeDav(t).URL, &logs)
	serve(h, signInRequest(`{"username":"private-user","password":"private-password"}`))
	c := sessionCookie(t, serve(h, signInRequest(`{"username":"alice","password":"secret"}`)))
	serve(h, withCookie(authRequest(), c))
	for _, secret := range []string{"private-user", "private-password", "alice", "secret", c.Value, basic("alice", "secret")} {
		if strings.Contains(logs.String(), secret) {
			t.Errorf("logs contain %q:\n%s", secret, logs.String())
		}
	}
	if !strings.Contains(logs.String(), `"level":"info"`) || !strings.Contains(logs.String(), `"logger":"natel-session"`) {
		t.Errorf("unexpected log shape:\n%s", logs.String())
	}
}

func TestPanicsAnswer500(t *testing.T) {
	var logs bytes.Buffer
	s := &server{store: newStore(time.Now), log: newLogger(&logs)}
	h := s.recoverPanics(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("boom") }))
	if w := serve(h, httptest.NewRequest("GET", "/auth", nil)); w.Code != http.StatusInternalServerError {
		t.Fatalf("got %d", w.Code)
	}
	if !strings.Contains(logs.String(), `"level":"error"`) {
		t.Fatalf("panic not logged:\n%s", logs.String())
	}
}

// Firefox and Safari send Origin: null on the page's own POST, under its
// no-referrer policy; Sec-Fetch-Site still says where it comes from.
func TestSignInTrustsSecFetchSite(t *testing.T) {
	h := newTestServer(t, fakeDav(t).URL, io.Discard)
	cases := map[string]struct {
		origin, site, host string
		want               int
	}{
		"null origin, same origin":    {"null", "same-origin", "natel.test", http.StatusOK},
		"rewritten Host, same origin": {"https://contacts.example", "same-origin", "natel:8080", http.StatusOK},
		"same host, another site":     {appOrigin, "cross-site", "natel.test", http.StatusForbidden},
		"same host, a sibling site":   {appOrigin, "same-site", "natel.test", http.StatusForbidden},
		"no Sec-Fetch-Site, null":     {"null", "", "natel.test", http.StatusForbidden},
	}
	for name, tc := range cases {
		r := signInRequest(`{"username":"alice","password":"secret"}`)
		r.Host = tc.host
		r.Header.Set("Origin", tc.origin)
		if tc.site != "" {
			r.Header.Set("Sec-Fetch-Site", tc.site)
		}
		if w := serve(h, r); w.Code != tc.want {
			t.Errorf("%s: got %d, want %d", name, w.Code, tc.want)
		}
	}
}

func TestAuthAnswersCaddyOnly(t *testing.T) {
	h := newTestServer(t, fakeDav(t).URL, io.Discard)
	c := sessionCookie(t, serve(h, signInRequest(`{"username":"alice","password":"secret"}`)))
	for _, secret := range []string{"", "wrong"} {
		r := withCookie(httptest.NewRequest("GET", "/auth", nil), c)
		if secret != "" {
			r.Header.Set(secretHeader, secret)
		}
		w := serve(h, r)
		if w.Code != http.StatusForbidden || w.Header().Get("Authorization") != "" {
			t.Fatalf("secret %q: %d %q", secret, w.Code, w.Header().Get("Authorization"))
		}
	}
}

// A sibling subdomain can add a cookie of the same name: with two, the
// browser's order decides, so neither is trusted.
func TestTwoSessionCookiesOpenNothing(t *testing.T) {
	h := newTestServer(t, fakeDav(t).URL, io.Discard)
	mine := sessionCookie(t, serve(h, signInRequest(`{"username":"alice","password":"secret"}`)))
	theirs := sessionCookie(t, serve(h, signInRequest(`{"username":"alice","password":"secret"}`)))
	r := withCookie(withCookie(authRequest(), theirs), mine)
	if w := serve(h, r); w.Code != http.StatusUnauthorized {
		t.Fatalf("got %d", w.Code)
	}
}

func TestSignInAtTheSessionLimitIsNotAnUnreachableServer(t *testing.T) {
	st := newStore(time.Now)
	fill(st, maxSessions)
	u, _ := url.Parse(fakeDav(t).URL)
	h := (&server{store: st, verifier: newVerifier(u), log: newLogger(io.Discard), secret: testSecret}).routes()
	if w := serve(h, signInRequest(`{"username":"alice","password":"secret"}`)); w.Code != http.StatusTooManyRequests {
		t.Fatalf("got %d", w.Code)
	}
}

// Over HTTPS, a plain cookie slipped in from a sibling subdomain must not
// open the session, even the attacker's own.
func TestASecureSessionIsReadUnderItsHostCookieOnly(t *testing.T) {
	h := newTestServer(t, fakeDav(t).URL, io.Discard)
	r := signInRequest(`{"username":"alice","password":"secret"}`)
	r.Header.Set("Origin", "https://natel.test")
	c := sessionCookie(t, serve(h, r))
	tossed := &http.Cookie{Name: cookieName, Value: c.Value}
	if w := serve(h, withCookie(authRequest(), tossed)); w.Code != http.StatusUnauthorized {
		t.Fatalf("got %d", w.Code)
	}
}

// A client can't get a plain cookie on HTTPS by claiming an http Origin:
// what Caddy saw wins.
func TestAForgedHTTPOriginStillGetsAHostCookieOverHTTPS(t *testing.T) {
	h := newTestServer(t, fakeDav(t).URL, io.Discard)
	r := signInRequest(`{"username":"alice","password":"secret"}`)
	r.Header.Set("X-Forwarded-Proto", "https")
	r.Header.Set("Sec-Fetch-Site", "same-origin")
	c := sessionCookie(t, serve(h, r))
	if c.Name != secureCookieName || !c.Secure {
		t.Fatalf("cookie %+v", c)
	}
	tossed := &http.Cookie{Name: cookieName, Value: c.Value}
	if w := serve(h, withCookie(authRequest(), tossed)); w.Code != http.StatusUnauthorized {
		t.Fatalf("got %d", w.Code)
	}
}
