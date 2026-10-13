package main

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var (
	errRejected    = errors.New("credentials rejected")
	errUnreachable = errors.New("CardDAV server unreachable")
	errUnexpected  = errors.New("CardDAV server gave no DAV answer")
)

// The context roots the app's discovery tries, in its order (src/dav/internal.ts).
var contextRoots = []string{"/.well-known/carddav", "/", "/dav.php/"}

const (
	maxRedirects  = 5
	verifyTimeout = 20 * time.Second
)

const principalQuery = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`

// verifier checks credentials against the CardDAV server before a session
// opens, so only a working sign-in takes up a session.
type verifier struct {
	upstream *url.URL
	client   *http.Client
}

func newVerifier(upstream *url.URL) *verifier {
	return &verifier{
		upstream: upstream,
		client: &http.Client{
			Timeout: verifyTimeout,
			// Redirects are followed by hand: Go would turn PROPFIND into GET.
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}
}

// verify answers nil when the server accepts the credentials on a context
// root: a 207 to PROPFIND. A 401 or 403 rejects them at once, as another
// root would not fix the password. forwardedFor is the client's address as
// Caddy forwards it, so the server, or a fail2ban, can block password
// guessing per client.
func (v *verifier) verify(ctx context.Context, authorization, forwardedFor string) error {
	unreachable := false
	for _, root := range contextRoots {
		status, err := v.propfind(ctx, root, authorization, forwardedFor)
		switch {
		case err != nil:
			unreachable = true
		case status == http.StatusMultiStatus:
			return nil
		case status == http.StatusUnauthorized || status == http.StatusForbidden:
			return errRejected
		}
	}
	if unreachable {
		return errUnreachable
	}
	return errUnexpected
}

// propfind follows redirects within the server's URL space, as the /dav
// proxy maps them: only the path and query of a Location are kept, so the
// credentials never leave the configured server.
func (v *verifier) propfind(ctx context.Context, path, authorization, forwardedFor string) (int, error) {
	target := v.upstream.ResolveReference(&url.URL{Path: path})
	for range maxRedirects + 1 {
		req, err := http.NewRequestWithContext(ctx, "PROPFIND", target.String(), strings.NewReader(principalQuery))
		if err != nil {
			return 0, err
		}
		req.Header.Set("Authorization", authorization)
		req.Header.Set("Depth", "0")
		req.Header.Set("Content-Type", "application/xml; charset=utf-8")
		if forwardedFor != "" {
			req.Header.Set("X-Forwarded-For", forwardedFor)
		}
		res, err := v.client.Do(req)
		if err != nil {
			return 0, err
		}
		_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 1<<20))
		_ = res.Body.Close()
		location := res.Header.Get("Location")
		if res.StatusCode < 300 || res.StatusCode >= 400 || location == "" {
			return res.StatusCode, nil
		}
		next, err := target.Parse(location)
		if err != nil {
			return res.StatusCode, nil
		}
		target = v.upstream.ResolveReference(&url.URL{Path: next.Path, RawPath: next.RawPath, RawQuery: next.RawQuery})
	}
	return http.StatusLoopDetected, nil
}
