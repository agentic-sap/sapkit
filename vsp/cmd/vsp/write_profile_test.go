package main

import (
	"strings"
	"testing"
)

// TestEnforceWriteProfile covers the client-side write gate for the two
// profile variables: SAP_READ_ONLY (truthy blocks) and SAP_TIER (any tier
// other than dev blocks). An empty env var is equivalent to unset.
func TestEnforceWriteProfile(t *testing.T) {
	cases := []struct {
		name      string
		readOnly  string // SAP_READ_ONLY ("" = unset)
		tier      string // SAP_TIER ("" = unset)
		wantBlock bool
		wantMark  string // substring required in the block message
	}{
		{"no env keeps prior behavior", "", "", false, ""},
		{"read-only true blocks", "true", "", true, "SAP_READ_ONLY=true"},
		{"read-only 1 blocks", "1", "", true, "SAP_READ_ONLY=true"},
		{"read-only TRUE blocks", "TRUE", "", true, "SAP_READ_ONLY=true"},
		{"read-only false allows", "false", "", false, ""},
		{"read-only 0 allows", "0", "", false, ""},
		{"tier qa blocks", "", "QA", true, "SAP_TIER=QA"},
		{"tier prd blocks", "", "prd", true, "SAP_TIER=prd"},
		{"tier dev allows", "", "dev", false, ""},
		{"tier DEV mixed-case allows", "", "DEV", false, ""},
		{"read-only wins over dev tier", "true", "dev", true, "SAP_READ_ONLY=true"},
		{"read-only false, tier qa still blocks", "false", "QA", true, "SAP_TIER=QA"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("SAP_READ_ONLY", tc.readOnly)
			t.Setenv("SAP_TIER", tc.tier)

			err := enforceWriteProfile()
			if tc.wantBlock {
				if err == nil {
					t.Fatalf("expected a block, got nil error")
				}
				if !strings.HasPrefix(err.Error(), "blocked:") {
					t.Errorf("block message must start with 'blocked:' marker, got: %v", err)
				}
				if tc.wantMark != "" && !strings.Contains(err.Error(), tc.wantMark) {
					t.Errorf("block message must name %q, got: %v", tc.wantMark, err)
				}
			} else if err != nil {
				t.Fatalf("expected no block, got: %v", err)
			}
		})
	}
}

// dummyParams returns systemParams pointed at an unreachable host with
// dummy credentials, so a client can be constructed without any intent to
// dial a real system.
func dummyParams() *systemParams {
	return &systemParams{
		URL:      "http://127.0.0.1:9",
		User:     "dummy",
		Password: "dummy",
		Client:   "001",
		Language: "EN",
	}
}

// TestGetWriteClientBlockedBeforeClient proves a forbidden profile is
// rejected at the write choke point — getWriteClient returns the marker
// error and no client, so no client method (hence no network dial) can run.
func TestGetWriteClientBlockedBeforeClient(t *testing.T) {
	t.Setenv("SAP_READ_ONLY", "true")
	t.Setenv("SAP_TIER", "")

	client, err := getWriteClient(dummyParams())
	if err == nil {
		t.Fatal("expected write profile to block, got nil error")
	}
	if client != nil {
		t.Errorf("expected nil client when blocked, got a client")
	}
	if !strings.Contains(err.Error(), "SAP_READ_ONLY=true") {
		t.Errorf("unexpected block error: %v", err)
	}
}

// TestGetWriteClientTierBlockedBeforeClient is the SAP_TIER counterpart.
func TestGetWriteClientTierBlockedBeforeClient(t *testing.T) {
	t.Setenv("SAP_READ_ONLY", "")
	t.Setenv("SAP_TIER", "QA")

	client, err := getWriteClient(dummyParams())
	if err == nil {
		t.Fatal("expected tier gate to block, got nil error")
	}
	if client != nil {
		t.Errorf("expected nil client when blocked, got a client")
	}
	if !strings.Contains(err.Error(), "SAP_TIER=QA") {
		t.Errorf("unexpected block error: %v", err)
	}
}

// TestGetWriteClientAllowedBuildsClient confirms that, absent a forbidding
// profile, getWriteClient behaves exactly like getClient and returns a
// usable client.
func TestGetWriteClientAllowedBuildsClient(t *testing.T) {
	t.Setenv("SAP_READ_ONLY", "false")
	t.Setenv("SAP_TIER", "dev")

	client, err := getWriteClient(dummyParams())
	if err != nil {
		t.Fatalf("expected client to build for an allowed profile, got: %v", err)
	}
	if client == nil {
		t.Fatal("expected a client for an allowed profile, got nil")
	}
}

// TestGetClientReadPathUnaffected verifies that read commands, which call
// getClient directly, are never gated by the two profile variables: the
// read client builds even when both are set to their most restrictive
// values.
func TestGetClientReadPathUnaffected(t *testing.T) {
	t.Setenv("SAP_READ_ONLY", "true")
	t.Setenv("SAP_TIER", "QA")

	client, err := getClient(dummyParams())
	if err != nil {
		t.Fatalf("read client build must be unaffected, got: %v", err)
	}
	if client == nil {
		t.Fatal("expected a read client, got nil")
	}
}
