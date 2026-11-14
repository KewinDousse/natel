package main

import (
	"crypto/md5"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"hash"
	"net/http"
	"slices"
	"strings"
	"sync/atomic"
)

// credential gives the Authorization header of one request to the CardDAV
// server: Basic sends the same one every time, Digest (RFC 7616) signs each
// request's method and URI.
type credential interface {
	authorization(method, uri string) string
}

type basicCredential string

func newBasic(username, password string) basicCredential {
	return basicCredential("Basic " + base64.StdEncoding.EncodeToString([]byte(username+":"+password)))
}

func (b basicCredential) authorization(string, string) string { return string(b) }

// digestCredential answers the challenge the server gave at sign-in. It
// keeps that nonce for the whole session, counting its uses: Baïkal (sabre/dav)
// accepts a nonce for as long as the password holds. It holds the hash of
// the password, not the password.
type digestCredential struct {
	username  string
	realm     string
	nonce     string
	opaque    string
	algorithm string
	qop       bool
	cnonce    string
	ha1       string
	newHash   func() hash.Hash
	count     atomic.Uint32
}

type challenge struct {
	scheme string
	params map[string]string
}

// newDigest answers the first Digest challenge it can, in the server's order
// of preference. It needs qop=auth or no qop: auth-int would sign each body.
func newDigest(username, password string, header http.Header) (*digestCredential, bool) {
	for _, c := range parseChallenges(header.Values("WWW-Authenticate")) {
		if c.scheme != "digest" || c.params["nonce"] == "" {
			continue
		}
		algorithm := c.params["algorithm"]
		if algorithm == "" {
			algorithm = "MD5"
		}
		base, session := strings.CutSuffix(strings.ToUpper(algorithm), "-SESS")
		var newHash func() hash.Hash
		switch base {
		case "MD5":
			newHash = md5.New
		case "SHA-256":
			newHash = sha256.New
		default:
			continue
		}
		offered, hasQop := c.params["qop"]
		qop := slices.ContainsFunc(strings.Split(offered, ","), func(o string) bool {
			return strings.EqualFold(strings.TrimSpace(o), "auth")
		})
		if hasQop && !qop {
			continue
		}
		d := &digestCredential{
			username:  username,
			realm:     c.params["realm"],
			nonce:     c.params["nonce"],
			opaque:    c.params["opaque"],
			algorithm: algorithm,
			qop:       qop,
			cnonce:    rand.Text(),
			newHash:   newHash,
		}
		d.ha1 = d.hash(username + ":" + d.realm + ":" + password)
		if session {
			d.ha1 = d.hash(d.ha1 + ":" + d.nonce + ":" + d.cnonce)
		}
		return d, true
	}
	return nil, false
}

func (d *digestCredential) hash(s string) string {
	h := d.newHash()
	h.Write([]byte(s))
	return hex.EncodeToString(h.Sum(nil))
}

func (d *digestCredential) authorization(method, uri string) string {
	ha2 := d.hash(method + ":" + uri)
	var b strings.Builder
	fmt.Fprintf(&b, `Digest username=%s, realm=%s, nonce=%s, uri=%s, algorithm=%s`,
		quote(d.username), quote(d.realm), quote(d.nonce), quote(uri), d.algorithm)
	if d.qop {
		nc := fmt.Sprintf("%08x", d.count.Add(1))
		response := d.hash(d.ha1 + ":" + d.nonce + ":" + nc + ":" + d.cnonce + ":auth:" + ha2)
		fmt.Fprintf(&b, `, qop=auth, nc=%s, cnonce=%s, response=%s`, nc, quote(d.cnonce), quote(response))
	} else {
		fmt.Fprintf(&b, `, response=%s`, quote(d.hash(d.ha1+":"+d.nonce+":"+ha2)))
	}
	if d.opaque != "" {
		fmt.Fprintf(&b, `, opaque=%s`, quote(d.opaque))
	}
	return b.String()
}

// negotiate picks the credential an anonymous request's answer asks for:
// Digest when a 401 offers a challenge Natel can answer, even next to Basic;
// Basic when it offers Basic or no challenge, or when the server let the
// request through. Any other answer picks none, so the password never goes
// out in Basic to a server that asked for another scheme.
func negotiate(username, password string, res *http.Response) credential {
	switch res.StatusCode {
	case http.StatusMultiStatus:
		return newBasic(username, password)
	case http.StatusUnauthorized:
		if digest, ok := newDigest(username, password, res.Header); ok {
			return digest
		}
		challenges := parseChallenges(res.Header.Values("WWW-Authenticate"))
		if len(challenges) == 0 || slices.ContainsFunc(challenges, func(c challenge) bool { return c.scheme == "basic" }) {
			return newBasic(username, password)
		}
	}
	return nil
}

// parseChallenges reads WWW-Authenticate values (RFC 9110, section 11.6.1),
// where a comma separates both challenges and their parameters.
func parseChallenges(values []string) []challenge {
	var out []challenge
	for _, value := range values {
		s := value
		for {
			s = strings.TrimLeft(s, " \t,")
			if s == "" {
				break
			}
			name, rest := token(s)
			if name == "" {
				// A token68 such as Negotiate's: skip to the next item.
				_, s, _ = strings.Cut(s, ",")
				continue
			}
			rest = strings.TrimLeft(rest, " \t")
			if strings.HasPrefix(rest, "=") && len(out) > 0 {
				// A parameter of the challenge before.
				var v string
				v, rest = paramValue(strings.TrimLeft(rest[1:], " \t"))
				out[len(out)-1].params[strings.ToLower(name)] = v
				s = rest
				continue
			}
			out = append(out, challenge{scheme: strings.ToLower(name), params: map[string]string{}})
			s = rest
		}
	}
	return out
}

func token(s string) (string, string) {
	i := strings.IndexFunc(s, func(r rune) bool {
		return r == ' ' || r == '\t' || r == ',' || r == '=' || r == '"'
	})
	if i < 0 {
		return s, ""
	}
	return s[:i], s[i:]
}

func paramValue(s string) (string, string) {
	if !strings.HasPrefix(s, `"`) {
		return token(s)
	}
	var b strings.Builder
	for i := 1; i < len(s); i++ {
		switch s[i] {
		case '\\':
			if i+1 < len(s) {
				i++
				b.WriteByte(s[i])
			}
		case '"':
			return b.String(), s[i+1:]
		default:
			b.WriteByte(s[i])
		}
	}
	return b.String(), ""
}

var quoter = strings.NewReplacer(`\`, `\\`, `"`, `\"`)

func quote(s string) string {
	return `"` + quoter.Replace(s) + `"`
}
