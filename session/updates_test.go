package main

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestUpdateCacheAndPrivacy(t *testing.T) {
	var calls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.RequestURI() != "/version.json" || r.Method != "GET" {
			t.Error("unexpected request")
		}
		for _, header := range []string{"Authorization", "Cookie", "Referer", "X-Forwarded-For", "X-Forwarded-Host", "Origin"} {
			if r.Header.Get(header) != "" {
				t.Errorf("leaked %s", header)
			}
		}
		if r.UserAgent() != "Natel update check" {
			t.Error("user agent contains more than the fixed identifier")
		}
		fmt.Fprint(w, `{"version":"0.4.0","releaseUrl":"`+releaseBaseURL+`0.4.0"}`)
	}))
	defer upstream.Close()
	checker := newUpdateChecker(true)
	checker.url = upstream.URL + "/version.json"
	now := time.Now()
	checker.now = func() time.Time { return now }
	var wg sync.WaitGroup
	for range 20 {
		wg.Go(func() {
			if info := checker.check(); info.Version != "0.4.0" {
				t.Errorf("unexpected update: %#v", info)
			}
		})
	}
	wg.Wait()
	if calls.Load() != 1 {
		t.Fatalf("got %d calls", calls.Load())
	}
	now = now.Add(updateInterval)
	checker.check()
	if calls.Load() != 2 {
		t.Fatal("cache did not expire")
	}
	checker.enabled = false
	if checker.check().Enabled || calls.Load() != 2 {
		t.Fatal("disabled checker made a request")
	}
}

func TestBadUpdateManifestsAreCachedAsUnavailable(t *testing.T) {
	for _, body := range []string{
		`{"version":"0.4.0-rc.1","releaseUrl":"` + releaseBaseURL + `0.4.0-rc.1"}`,
		`{"version":"00.4.0","releaseUrl":"` + releaseBaseURL + `00.4.0"}`,
		`{"version":"0.4.0","releaseUrl":"https://elsewhere.invalid/"}`,
		`{"version":"0.4.0","releaseUrl":"` + releaseBaseURL + `0.4.0"} {}`,
		strings.Repeat(" ", 4097),
		`<html>Not found</html>`,
	} {
		t.Run(body[:min(len(body), 60)], func(t *testing.T) {
			calls := 0
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls++; fmt.Fprint(w, body) }))
			defer upstream.Close()
			checker := newUpdateChecker(true)
			checker.url = upstream.URL
			for range 2 {
				if info := checker.check(); !info.Enabled || info.Version != "" {
					t.Errorf("accepted malformed manifest: %#v", info)
				}
			}
			if calls != 1 {
				t.Fatalf("failed requests were retried: %d", calls)
			}
		})
	}
}

func TestUpdateRedirectIsNotFollowed(t *testing.T) {
	calls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		http.Redirect(w, r, "/redirected", http.StatusFound)
	}))
	defer upstream.Close()
	checker := newUpdateChecker(true)
	checker.url = upstream.URL
	if checker.check().Version != "" || calls != 1 {
		t.Fatal("followed a redirect")
	}
}

func TestUpdateRouteRequiresSession(t *testing.T) {
	checker := newUpdateChecker(false)
	st := newStore(time.Now)
	srv := (&server{store: st, log: newLogger(io.Discard), updateChecker: checker}).routes()
	req := httptest.NewRequest("GET", "/updates", nil)
	response := httptest.NewRecorder()
	srv.ServeHTTP(response, req)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("got %d without a session", response.Code)
	}
	token, err := st.open("alice", "secret", cookieName)
	if err != nil {
		t.Fatal(err)
	}
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	response = httptest.NewRecorder()
	srv.ServeHTTP(response, req)
	if response.Code != http.StatusOK || response.Body.String() != "{\"enabled\":false}\n" {
		t.Fatalf("unexpected response: %s", response.Body.String())
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("browser may cache instance configuration")
	}
}
