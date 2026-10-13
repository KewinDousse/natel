package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func verifierFor(t *testing.T, handler http.HandlerFunc) *verifier {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	u, _ := url.Parse(srv.URL)
	return newVerifier(u)
}

func TestVerifyFollowsRedirectsAsPropfindOnTheSameServer(t *testing.T) {
	var seen []string
	v := verifierFor(t, func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.Method+" "+r.URL.RequestURI())
		switch r.URL.Path {
		case "/.well-known/carddav":
			// Another host in the Location stays on the configured server.
			w.Header().Set("Location", "https://elsewhere.test/remote.php/dav/?x=1")
			w.WriteHeader(http.StatusMovedPermanently)
		case "/remote.php/dav/":
			if r.Header.Get("Authorization") == "" || r.Header.Get("Depth") != "0" {
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			w.WriteHeader(http.StatusMultiStatus)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})
	if err := v.verify(context.Background(), basic("alice", "secret"), ""); err != nil {
		t.Fatal(err)
	}
	want := []string{"PROPFIND /.well-known/carddav", "PROPFIND /remote.php/dav/?x=1"}
	if len(seen) != len(want) || seen[0] != want[0] || seen[1] != want[1] {
		t.Fatalf("requests %v, want %v", seen, want)
	}
}

func TestVerifyStopsAtTheFirstRejection(t *testing.T) {
	calls := 0
	v := verifierFor(t, func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.WriteHeader(http.StatusUnauthorized)
	})
	if err := v.verify(context.Background(), basic("alice", "wrong"), ""); err != errRejected {
		t.Fatalf("got %v", err)
	}
	if calls != 1 {
		t.Fatalf("%d requests after a rejection", calls)
	}
}

func TestVerifyWithoutADavAnswer(t *testing.T) {
	v := verifierFor(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	if err := v.verify(context.Background(), basic("alice", "secret"), ""); err != errUnexpected {
		t.Fatalf("got %v", err)
	}
}

func TestVerifyGivesUpOnRedirectLoops(t *testing.T) {
	v := verifierFor(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Location", r.URL.Path)
		w.WriteHeader(http.StatusTemporaryRedirect)
	})
	if err := v.verify(context.Background(), basic("alice", "secret"), ""); err != errUnexpected {
		t.Fatalf("got %v", err)
	}
}

func TestVerifyPassesTheClientAddressOn(t *testing.T) {
	var forwarded []string
	v := verifierFor(t, func(w http.ResponseWriter, r *http.Request) {
		forwarded = append(forwarded, r.Header.Get("X-Forwarded-For"))
		w.WriteHeader(http.StatusUnauthorized)
	})
	_ = v.verify(context.Background(), basic("alice", "wrong"), "203.0.113.7")
	if len(forwarded) != 1 || forwarded[0] != "203.0.113.7" {
		t.Fatalf("X-Forwarded-For %v", forwarded)
	}
}
