package main

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func challengeHeader(values ...string) http.Header {
	h := http.Header{}
	for _, v := range values {
		h.Add("WWW-Authenticate", v)
	}
	return h
}

// The example of RFC 7616, section 3.9.1.
func TestDigestMatchesTheRFCExample(t *testing.T) {
	for _, tc := range []struct{ algorithm, response string }{
		{"MD5", "8ca523f5e9506fed4657c9700eebdbec"},
		{"SHA-256", "753927fa0e85d155564e2e272a28d1802ca10daf4496794697cf8db5856cb6c1"},
	} {
		d, ok := newDigest("Mufasa", "Circle of Life", challengeHeader(`Digest realm="http-auth@example.org", `+
			`qop="auth, auth-int", algorithm=`+tc.algorithm+`, nonce="7ypf/xlj9XXwfDPEoM4URrv/xwf94BcCAzFZH4GiTo0v", `+
			`opaque="FQhe/qaU925kfnzjCev0ciny7QMkPqMAFRtzCUYo5tdS"`))
		if !ok {
			t.Fatalf("%s: no credential", tc.algorithm)
		}
		d.cnonce = "f2/wE4q74E6zIJEtWaHKaf5wv/H5QzzpXusqGemxURZJ"
		got := d.authorization("GET", "/dir/index.html")
		if !strings.Contains(got, `response="`+tc.response+`"`) || !strings.Contains(got, "nc=00000001") ||
			!strings.Contains(got, `opaque="FQhe/qaU925kfnzjCev0ciny7QMkPqMAFRtzCUYo5tdS"`) {
			t.Fatalf("%s: %s", tc.algorithm, got)
		}
		if again := d.authorization("GET", "/dir/index.html"); !strings.Contains(again, "nc=00000002") {
			t.Fatalf("%s: the nonce count didn't move: %s", tc.algorithm, again)
		}
	}
}

func TestDigestTakesTheFirstChallengeItCanAnswer(t *testing.T) {
	d, ok := newDigest("alice", "secret", challengeHeader(
		`Digest realm="a", nonce="n1", qop="auth-int", Digest realm="b", nonce="n2", algorithm=SHA-512-256`,
		`Digest realm="c, with a comma", nonce="n\"3"`,
	))
	if !ok || d.realm != "c, with a comma" || d.nonce != `n"3` || d.qop {
		t.Fatalf("got %+v", d)
	}
	if !strings.Contains(d.authorization("PUT", "/x"), `nonce="n\"3"`) {
		t.Fatal("the nonce isn't quoted back")
	}
	if _, ok := newDigest("alice", "secret", challengeHeader(`Basic realm="x"`)); ok {
		t.Fatal("a Basic challenge gave a Digest credential")
	}
}

// fakeDigestDav accepts alice:secret with Digest only, as Baïkal does by
// default, and checks each request's signature against its method and URI.
func fakeDigestDav(t *testing.T) *httptest.Server {
	t.Helper()
	const realm, nonce = "BaikalDAV", "server-nonce"
	ha1 := md5Hex("alice:" + realm + ":secret")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		got := parseChallenges([]string{r.Header.Get("Authorization")})
		if len(got) == 1 && got[0].scheme == "digest" {
			p := got[0].params
			want := md5Hex(ha1 + ":" + nonce + ":" + p["nc"] + ":" + p["cnonce"] + ":auth:" +
				md5Hex(r.Method+":"+r.URL.RequestURI()))
			if p["username"] == "alice" && p["nonce"] == nonce && p["uri"] == r.URL.RequestURI() && p["response"] == want {
				w.WriteHeader(http.StatusMultiStatus)
				return
			}
		}
		w.Header().Set("WWW-Authenticate", `Digest realm="`+realm+`",qop="auth",nonce="`+nonce+`",opaque="o"`)
		w.WriteHeader(http.StatusUnauthorized)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func md5Hex(s string) string {
	sum := md5.Sum([]byte(s))
	return hex.EncodeToString(sum[:])
}

func TestSignInAnswersADigestServer(t *testing.T) {
	dav := fakeDigestDav(t)
	h := newTestServer(t, dav.URL, io.Discard)
	w := serve(h, signInRequest(`{"username":"alice","password":"secret"}`))
	if w.Code != http.StatusOK {
		t.Fatalf("sign-in: %d", w.Code)
	}
	r := withCookie(authRequest(), sessionCookie(t, w))
	r.Header.Set("X-Forwarded-Method", "PUT")
	r.Header.Set("X-Forwarded-Uri", "/dav.php/addressbooks/alice/contacts/a.vcf")
	auth := serve(h, r)
	authorization := auth.Header().Get("Authorization")
	if auth.Code != http.StatusNoContent || !strings.HasPrefix(authorization, "Digest ") {
		t.Fatalf("auth: %d %q", auth.Code, authorization)
	}
	// The header Caddy would copy onto that request.
	req, _ := http.NewRequest("PUT", dav.URL+"/dav.php/addressbooks/alice/contacts/a.vcf", nil)
	req.Header.Set("Authorization", authorization)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	_ = res.Body.Close()
	if res.StatusCode != http.StatusMultiStatus {
		t.Fatalf("the server refused the signed request: %d", res.StatusCode)
	}
}

func TestVerifyRejectsAWrongDigestPassword(t *testing.T) {
	calls := 0
	dav := fakeDigestDav(t)
	v := verifierFor(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		dav.Config.Handler.ServeHTTP(w, r)
	})
	if _, err := v.verify(context.Background(), "alice", "wrong", ""); err != errRejected {
		t.Fatalf("got %v", err)
	}
	// The anonymous request, then Digest, on the first root only.
	if calls != 2 {
		t.Fatalf("%d requests", calls)
	}
}

func TestVerifySendsNoPasswordBeforeTheChallenge(t *testing.T) {
	var sent []string
	v := verifierFor(t, func(w http.ResponseWriter, r *http.Request) {
		sent = append(sent, r.Header.Get("Authorization"))
		w.Header().Add("WWW-Authenticate", `Basic realm="x"`)
		w.Header().Add("WWW-Authenticate", `Digest realm="x", nonce="n", qop="auth"`)
		w.WriteHeader(http.StatusUnauthorized)
	})
	if _, err := v.verify(context.Background(), "alice", "wrong", ""); err != errRejected {
		t.Fatalf("got %v", err)
	}
	// Digest is preferred when the server offers both.
	if len(sent) != 2 || sent[0] != "" || !strings.HasPrefix(sent[1], "Digest ") {
		t.Fatalf("Authorization headers %q", sent)
	}
}

// Baïkal in Digest without the .well-known redirect: the probe goes on to
// the root that asks.
func TestVerifyProbesUntilARootAsks(t *testing.T) {
	var sent []string
	dav := fakeDigestDav(t)
	v := verifierFor(t, func(w http.ResponseWriter, r *http.Request) {
		sent = append(sent, r.URL.Path+" "+strings.SplitN(r.Header.Get("Authorization"), " ", 2)[0])
		if r.URL.Path != "/dav.php/" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		dav.Config.Handler.ServeHTTP(w, r)
	})
	if _, err := v.verify(context.Background(), "alice", "secret", ""); err != nil {
		t.Fatal(err)
	}
	want := "/.well-known/carddav |/ |/dav.php/ |/dav.php/ Digest"
	if got := strings.Join(sent, "|"); got != want {
		t.Fatalf("requests %q, want %q", got, want)
	}
}

func TestVerifySendsNoBasicToAChallengeItCantAnswer(t *testing.T) {
	var sent []string
	v := verifierFor(t, func(w http.ResponseWriter, r *http.Request) {
		sent = append(sent, r.Header.Get("Authorization"))
		w.Header().Set("WWW-Authenticate", `Digest realm="x", nonce="n", algorithm=SHA-512-256`)
		w.WriteHeader(http.StatusUnauthorized)
	})
	if _, err := v.verify(context.Background(), "alice", "secret", ""); err != errUnexpected {
		t.Fatalf("got %v", err)
	}
	if strings.Join(sent, "") != "" {
		t.Fatalf("Authorization headers %q", sent)
	}
}

func TestParseChallengesSkipsAToken68(t *testing.T) {
	got := parseChallenges([]string{`Negotiate abc==, Digest realm="r", nonce="n"`})
	if len(got) != 2 || got[1].scheme != "digest" || got[1].params["nonce"] != "n" {
		t.Fatalf("got %+v", got)
	}
}
