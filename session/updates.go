package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"regexp"
	"sync"
	"time"
)

const updateManifestURL = "https://demo.natel.app/version.json"
const releaseBaseURL = "https://github.com/KewinDousse/natel/releases/tag/v"
const updateInterval = 24 * time.Hour

var stableVersion = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`)

type updateInfo struct {
	Enabled    bool   `json:"enabled"`
	Version    string `json:"version,omitempty"`
	ReleaseURL string `json:"releaseUrl,omitempty"`
}

type updateChecker struct {
	mu      sync.Mutex
	enabled bool
	client  *http.Client
	url     string
	now     func() time.Time
	next    time.Time
	info    updateInfo
}

func newUpdateChecker(enabled bool) *updateChecker {
	return &updateChecker{
		enabled: enabled,
		url:     updateManifestURL,
		now:     time.Now,
		client: &http.Client{
			Timeout: 5 * time.Second,
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}
}

func (c *updateChecker) check() updateInfo {
	if !c.enabled {
		return updateInfo{Enabled: false}
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.now().Before(c.next) {
		return c.info
	}
	// Failed attempts count too, so an outage cannot turn page loads into polling.
	c.next = c.now().Add(updateInterval)
	c.info = updateInfo{Enabled: true}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.url, nil)
	if err != nil {
		return c.info
	}
	// Construct a fresh request: no browser headers or installed version leave Natel.
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Natel update check")
	resp, err := c.client.Do(req)
	if err != nil {
		return c.info
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return c.info
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4097))
	if err != nil || len(body) > 4096 {
		return c.info
	}
	var manifest struct {
		Version    string `json:"version"`
		ReleaseURL string `json:"releaseUrl"`
	}
	if json.Unmarshal(body, &manifest) != nil || len(manifest.Version) > 80 ||
		!stableVersion.MatchString(manifest.Version) || manifest.ReleaseURL != releaseBaseURL+manifest.Version {
		return c.info
	}
	c.info.Version = manifest.Version
	c.info.ReleaseURL = manifest.ReleaseURL
	return c.info
}

func (s *server) updates(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.lookup(r); !ok {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	if s.updateChecker == nil {
		writeJSON(w, updateInfo{Enabled: false})
		return
	}
	writeJSON(w, s.updateChecker.check())
}
