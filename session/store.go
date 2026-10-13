package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"
	"sync"
	"time"
)

const (
	idleTimeout = 12 * time.Hour
	maxLifetime = 7 * 24 * time.Hour
	maxSessions = 10_000
	// One account signing in over and over can't fill the store for everyone.
	maxPerUser = 20
)

var errFull = errors.New("too many sessions")

type session struct {
	username      string
	authorization string
	// cookie is the name the token was issued under: a token read under the
	// other name was slipped in, as a plain cookie from a sibling subdomain.
	cookie   string
	created  time.Time
	lastSeen time.Time
}

func (s *session) expired(now time.Time) bool {
	return now.Sub(s.lastSeen) >= idleTimeout || now.Sub(s.created) >= maxLifetime
}

// store holds sessions in memory only: a restart signs everyone out.
// Keys are the SHA-256 of the token, so a map lookup's timing tells
// nothing about the token itself.
type store struct {
	mu       sync.Mutex
	now      func() time.Time
	sessions map[[sha256.Size]byte]*session
}

func newStore(now func() time.Time) *store {
	return &store{now: now, sessions: make(map[[sha256.Size]byte]*session)}
}

// randomToken returns 32 random bytes, encoded for a cookie or a header.
func randomToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

// open creates a session and returns its token.
func (st *store) open(username, authorization, cookie string) (string, error) {
	token, err := randomToken()
	if err != nil {
		return "", err
	}
	st.mu.Lock()
	defer st.mu.Unlock()
	now := st.now()
	st.evictOldestLocked(username)
	if len(st.sessions) >= maxSessions {
		st.sweepLocked(now)
		if len(st.sessions) >= maxSessions {
			return "", errFull
		}
	}
	st.sessions[sha256.Sum256([]byte(token))] = &session{
		username:      username,
		authorization: authorization,
		cookie:        cookie,
		created:       now,
		lastSeen:      now,
	}
	return token, nil
}

// get returns a live session and counts the call as activity.
func (st *store) get(token, cookie string) (session, bool) {
	key := sha256.Sum256([]byte(token))
	st.mu.Lock()
	defer st.mu.Unlock()
	s, ok := st.sessions[key]
	if !ok || s.cookie != cookie {
		return session{}, false
	}
	now := st.now()
	if s.expired(now) {
		delete(st.sessions, key)
		return session{}, false
	}
	s.lastSeen = now
	return *s, true
}

func (st *store) close(token string) {
	st.mu.Lock()
	defer st.mu.Unlock()
	delete(st.sessions, sha256.Sum256([]byte(token)))
}

func (st *store) sweep() {
	st.mu.Lock()
	defer st.mu.Unlock()
	st.sweepLocked(st.now())
}

func (st *store) sweepLocked(now time.Time) {
	for key, s := range st.sessions {
		if s.expired(now) {
			delete(st.sessions, key)
		}
	}
}

// evictOldestLocked closes the user's least recently used session once
// they hold maxPerUser. Many servers accept a login whatever its case or
// surrounding spaces: each spelling must not count as another account.
func (st *store) evictOldestLocked(username string) {
	account := strings.TrimSpace(username)
	count := 0
	var oldest [sha256.Size]byte
	var oldestSeen time.Time
	for key, s := range st.sessions {
		if !strings.EqualFold(strings.TrimSpace(s.username), account) {
			continue
		}
		count++
		if count == 1 || s.lastSeen.Before(oldestSeen) {
			oldest, oldestSeen = key, s.lastSeen
		}
	}
	if count >= maxPerUser {
		delete(st.sessions, oldest)
	}
}
