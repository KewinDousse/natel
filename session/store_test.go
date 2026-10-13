package main

import (
	"crypto/sha256"
	"fmt"
	"strings"
	"testing"
	"time"
)

type clock struct{ t time.Time }

func (c *clock) now() time.Time { return c.t }

func TestStoreExpiresIdleSessions(t *testing.T) {
	c := &clock{t: time.Unix(1_700_000_000, 0)}
	st := newStore(c.now)
	token, err := st.open("alice", "Basic x", cookieName)
	if err != nil {
		t.Fatal(err)
	}
	c.t = c.t.Add(idleTimeout - time.Second)
	if _, ok := st.get(token, cookieName); !ok {
		t.Fatal("a session used within the idle timeout expired")
	}
	c.t = c.t.Add(idleTimeout - time.Second)
	if _, ok := st.get(token, cookieName); !ok {
		t.Fatal("activity didn't extend the session")
	}
	c.t = c.t.Add(idleTimeout)
	if _, ok := st.get(token, cookieName); ok {
		t.Fatal("an idle session stayed open")
	}
}

func TestStoreEndsSessionsAtTheirLifetime(t *testing.T) {
	c := &clock{t: time.Unix(1_700_000_000, 0)}
	st := newStore(c.now)
	token, _ := st.open("alice", "Basic x", cookieName)
	for c.t.Before(time.Unix(1_700_000_000, 0).Add(maxLifetime - time.Hour)) {
		c.t = c.t.Add(time.Hour)
		if _, ok := st.get(token, cookieName); !ok {
			t.Fatal("an active session ended before its lifetime")
		}
	}
	c.t = c.t.Add(time.Hour)
	if _, ok := st.get(token, cookieName); ok {
		t.Fatal("an active session outlived its lifetime")
	}
}

func TestStoreClosesAndSweeps(t *testing.T) {
	c := &clock{t: time.Unix(1_700_000_000, 0)}
	st := newStore(c.now)
	closed, _ := st.open("alice", "Basic x", cookieName)
	st.close(closed)
	if _, ok := st.get(closed, cookieName); ok {
		t.Fatal("a closed session stayed open")
	}
	_, _ = st.open("bob", "Basic y", cookieName)
	c.t = c.t.Add(idleTimeout)
	st.sweep()
	if len(st.sessions) != 0 {
		t.Fatalf("%d expired sessions kept", len(st.sessions))
	}
}

func TestStoreCapsSessions(t *testing.T) {
	c := &clock{t: time.Unix(1_700_000_000, 0)}
	st := newStore(c.now)
	fill(st, maxSessions)
	if _, err := st.open("alice", "Basic x", cookieName); err != errFull {
		t.Fatalf("got %v, want errFull", err)
	}
	// Expired sessions make room again.
	c.t = c.t.Add(idleTimeout)
	if _, err := st.open("alice", "Basic x", cookieName); err != nil {
		t.Fatal(err)
	}
}

func TestStoreTokensAreUniqueAndUnguessable(t *testing.T) {
	st := newStore(time.Now)
	a, _ := st.open("alice", "Basic x", cookieName)
	b, _ := st.open("alice", "Basic x", cookieName)
	if a == b || len(a) < 43 {
		t.Fatalf("weak tokens: %q, %q", a, b)
	}
	if _, ok := st.get(a+"x", cookieName); ok {
		t.Fatal("a altered token opened a session")
	}
}

func TestStoreKeepsEachUsersRecentSessionsOnly(t *testing.T) {
	c := &clock{t: time.Unix(1_700_000_000, 0)}
	st := newStore(c.now)
	var tokens []string
	for range maxPerUser {
		c.t = c.t.Add(time.Second)
		token, _ := st.open("alice", "Basic x", cookieName)
		tokens = append(tokens, token)
	}
	// The first one is used again: the second becomes the oldest.
	c.t = c.t.Add(time.Second)
	st.get(tokens[0], cookieName)
	_, _ = st.open("alice", "Basic x", cookieName)
	if _, ok := st.get(tokens[1], cookieName); ok {
		t.Fatal("the least recently used session stayed open")
	}
	if _, ok := st.get(tokens[0], cookieName); !ok {
		t.Fatal("a recently used session closed")
	}
	if _, err := st.open("bob", "Basic y", cookieName); err != nil || len(st.sessions) != maxPerUser+1 {
		t.Fatalf("another user's sign-in: %v, %d sessions", err, len(st.sessions))
	}
}

func TestStoreReadsATokenUnderItsOwnCookieNameOnly(t *testing.T) {
	st := newStore(time.Now)
	token, _ := st.open("alice", "Basic x", secureCookieName)
	if _, ok := st.get(token, cookieName); ok {
		t.Fatal("a __Host- token opened a session as a plain cookie")
	}
	if _, ok := st.get(token, secureCookieName); !ok {
		t.Fatal("the token didn't open its session")
	}
}

func TestStoreCountsSpellingsOfALoginAsOneAccount(t *testing.T) {
	st := newStore(time.Now)
	for i := range maxPerUser + 5 {
		_, _ = st.open("alice"+strings.Repeat(" ", i%3), "Basic x", cookieName)
		_, _ = st.open("ALICE", "Basic x", cookieName)
	}
	if len(st.sessions) != maxPerUser {
		t.Fatalf("%d sessions for one account", len(st.sessions))
	}
}

// fill opens n sessions for as many accounts, without open's per-account scan.
func fill(st *store, n int) {
	now := st.now()
	for i := range n {
		st.sessions[sha256.Sum256(fmt.Append(nil, i))] = &session{
			username: fmt.Sprint("user", i), authorization: "Basic x", cookie: cookieName,
			created: now, lastSeen: now,
		}
	}
}
