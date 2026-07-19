package adt

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseCookieString(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected map[string]string
	}{
		{
			name:  "single cookie",
			input: "session=abc123",
			expected: map[string]string{
				"session": "abc123",
			},
		},
		{
			name:  "multiple cookies",
			input: "session=abc123; token=xyz789",
			expected: map[string]string{
				"session": "abc123",
				"token":   "xyz789",
			},
		},
		{
			name:  "cookies with spaces",
			input: "  session = abc123 ;  token = xyz789  ",
			expected: map[string]string{
				"session": "abc123",
				"token":   "xyz789",
			},
		},
		{
			name:  "cookie with equals in value",
			input: "data=key=value; other=test",
			expected: map[string]string{
				"data":  "key=value",
				"other": "test",
			},
		},
		{
			name:     "empty string",
			input:    "",
			expected: map[string]string{},
		},
		{
			name:     "no equals sign",
			input:    "invalid",
			expected: map[string]string{},
		},
		{
			name:  "SAP style cookies",
			input: "sap-usercontext=sap-language=EN&sap-client=001; SAP_SESSIONID_A4H_001=abc123",
			expected: map[string]string{
				"sap-usercontext":       "sap-language=EN&sap-client=001",
				"SAP_SESSIONID_A4H_001": "abc123",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ParseCookieString(tt.input)
			if len(result) != len(tt.expected) {
				t.Errorf("ParseCookieString(%q) returned %d cookies, expected %d", tt.input, len(result), len(tt.expected))
				return
			}
			for k, v := range tt.expected {
				if result[k] != v {
					t.Errorf("ParseCookieString(%q)[%q] = %q, expected %q", tt.input, k, result[k], v)
				}
			}
		})
	}
}

func TestLoadCookiesFromFile(t *testing.T) {
	// Create a temporary directory for test files
	tmpDir := t.TempDir()

	t.Run("netscape format", func(t *testing.T) {
		content := `# Netscape HTTP Cookie File
# This is a comment
vhcala4hci	FALSE	/	TRUE	1764762969	sap-usercontext	sap-language=EN&sap-client=001
vhcala4hci	FALSE	/	TRUE	1764762969	SAP_SESSIONID_A4H_001	abc123
`
		path := filepath.Join(tmpDir, "netscape_cookies.txt")
		if err := os.WriteFile(path, []byte(content), 0644); err != nil {
			t.Fatal(err)
		}

		cookies, err := LoadCookiesFromFile(path)
		if err != nil {
			t.Fatalf("LoadCookiesFromFile failed: %v", err)
		}

		expected := map[string]string{
			"sap-usercontext":       "sap-language=EN&sap-client=001",
			"SAP_SESSIONID_A4H_001": "abc123",
		}

		if len(cookies) != len(expected) {
			t.Errorf("Got %d cookies, expected %d", len(cookies), len(expected))
		}

		for k, v := range expected {
			if cookies[k] != v {
				t.Errorf("Cookie[%q] = %q, expected %q", k, cookies[k], v)
			}
		}
	})

	t.Run("key-value format", func(t *testing.T) {
		content := `# Simple key=value format
session=abc123
token=xyz789
`
		path := filepath.Join(tmpDir, "simple_cookies.txt")
		if err := os.WriteFile(path, []byte(content), 0644); err != nil {
			t.Fatal(err)
		}

		cookies, err := LoadCookiesFromFile(path)
		if err != nil {
			t.Fatalf("LoadCookiesFromFile failed: %v", err)
		}

		expected := map[string]string{
			"session": "abc123",
			"token":   "xyz789",
		}

		if len(cookies) != len(expected) {
			t.Errorf("Got %d cookies, expected %d", len(cookies), len(expected))
		}

		for k, v := range expected {
			if cookies[k] != v {
				t.Errorf("Cookie[%q] = %q, expected %q", k, cookies[k], v)
			}
		}
	})

	t.Run("mixed format", func(t *testing.T) {
		content := `# Mixed format file
# Netscape format line
example.com	FALSE	/	FALSE	0	netscape_cookie	value1
# Simple format line
simple_cookie=value2
`
		path := filepath.Join(tmpDir, "mixed_cookies.txt")
		if err := os.WriteFile(path, []byte(content), 0644); err != nil {
			t.Fatal(err)
		}

		cookies, err := LoadCookiesFromFile(path)
		if err != nil {
			t.Fatalf("LoadCookiesFromFile failed: %v", err)
		}

		if cookies["netscape_cookie"] != "value1" {
			t.Errorf("netscape_cookie = %q, expected %q", cookies["netscape_cookie"], "value1")
		}
		if cookies["simple_cookie"] != "value2" {
			t.Errorf("simple_cookie = %q, expected %q", cookies["simple_cookie"], "value2")
		}
	})

	t.Run("empty file", func(t *testing.T) {
		path := filepath.Join(tmpDir, "empty_cookies.txt")
		if err := os.WriteFile(path, []byte(""), 0644); err != nil {
			t.Fatal(err)
		}

		cookies, err := LoadCookiesFromFile(path)
		if err != nil {
			t.Fatalf("LoadCookiesFromFile failed: %v", err)
		}

		if len(cookies) != 0 {
			t.Errorf("Got %d cookies, expected 0", len(cookies))
		}
	})

	t.Run("comments only", func(t *testing.T) {
		content := `# Comment line 1
# Comment line 2
`
		path := filepath.Join(tmpDir, "comments_cookies.txt")
		if err := os.WriteFile(path, []byte(content), 0644); err != nil {
			t.Fatal(err)
		}

		cookies, err := LoadCookiesFromFile(path)
		if err != nil {
			t.Fatalf("LoadCookiesFromFile failed: %v", err)
		}

		if len(cookies) != 0 {
			t.Errorf("Got %d cookies, expected 0", len(cookies))
		}
	})

	t.Run("file not found", func(t *testing.T) {
		_, err := LoadCookiesFromFile(filepath.Join(tmpDir, "nonexistent.txt"))
		if err == nil {
			t.Error("Expected error for nonexistent file, got nil")
		}
	})
}

func TestConfigCookieAuth(t *testing.T) {
	t.Run("HasBasicAuth with credentials", func(t *testing.T) {
		cfg := &Config{
			Username: "user",
			Password: "pass",
		}
		if !cfg.HasBasicAuth() {
			t.Error("HasBasicAuth() should return true when credentials are set")
		}
	})

	t.Run("HasBasicAuth without credentials", func(t *testing.T) {
		cfg := &Config{}
		if cfg.HasBasicAuth() {
			t.Error("HasBasicAuth() should return false when credentials are empty")
		}
	})

	t.Run("HasBasicAuth with only username", func(t *testing.T) {
		cfg := &Config{Username: "user"}
		if cfg.HasBasicAuth() {
			t.Error("HasBasicAuth() should return false when only username is set")
		}
	})

	t.Run("HasBasicAuth with only password", func(t *testing.T) {
		cfg := &Config{Password: "pass"}
		if cfg.HasBasicAuth() {
			t.Error("HasBasicAuth() should return false when only password is set")
		}
	})

	t.Run("HasCookieAuth with cookies", func(t *testing.T) {
		cfg := &Config{
			Cookies: map[string]string{"session": "abc"},
		}
		if !cfg.HasCookieAuth() {
			t.Error("HasCookieAuth() should return true when cookies are set")
		}
	})

	t.Run("HasCookieAuth without cookies", func(t *testing.T) {
		cfg := &Config{}
		if cfg.HasCookieAuth() {
			t.Error("HasCookieAuth() should return false when cookies are empty")
		}
	})

	t.Run("HasCookieAuth with empty cookie map", func(t *testing.T) {
		cfg := &Config{
			Cookies: map[string]string{},
		}
		if cfg.HasCookieAuth() {
			t.Error("HasCookieAuth() should return false when cookie map is empty")
		}
	})
}

func TestWithCookies(t *testing.T) {
	cookies := map[string]string{
		"session": "abc123",
		"token":   "xyz789",
	}

	cfg := NewConfig("http://example.com", "", "", WithCookies(cookies))

	if !cfg.HasCookieAuth() {
		t.Error("Config should have cookie auth after WithCookies")
	}

	if cfg.Cookies["session"] != "abc123" {
		t.Errorf("Cookies[session] = %q, expected %q", cfg.Cookies["session"], "abc123")
	}
	if cfg.Cookies["token"] != "xyz789" {
		t.Errorf("Cookies[token] = %q, expected %q", cfg.Cookies["token"], "xyz789")
	}
}

func TestWithVerbose(t *testing.T) {
	cfg := NewConfig("http://example.com", "user", "pass", WithVerbose())

	if !cfg.Verbose {
		t.Error("Config should have Verbose=true after WithVerbose")
	}
}
