package main

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/oisee/vibing-steampunk/embedded/deps"
	"github.com/oisee/vibing-steampunk/pkg/adt"
)

// stubTransport is a minimal adt.HTTPDoer that returns 404 for every
// request. deployClass's existence-check GET (client.GetClass, issued
// internally by WriteSource in upsert mode) is the only HTTP call this
// test needs to satisfy — the failure path under test (opts.Package=="")
// short-circuits WriteSource's create path before any further request is
// made, so no other route needs to be mocked.
type stubTransport struct{}

func (stubTransport) Do(req *http.Request) (*http.Response, error) {
	return &http.Response{
		StatusCode: http.StatusNotFound,
		Body:       io.NopCloser(strings.NewReader("not found")),
		Header:     http.Header{},
	}, nil
}

// TestDeployClass_ReturnsErrorWhenWriteSourceFails is the regression test
// for the copy command's "false success" bug: deployClass (and its four
// siblings deployInterface/deployDDLS/deployBDEF/deploySRVD) used to
// discard WriteSource's *result* and only check err. WriteSource signals
// a rejected write via Success=false + a nil error (e.g. a missing
// required field, or a syntax error), so a caller that checks only err
// silently counts that failure as a deploy success.
//
// This test drives that exact path: passing an empty target package
// makes WriteSource's create-path validation fail with
// "Package is required for creating new objects" — Success=false, err
// nil — without needing to mock the full SAP HTTP flow. Before the fix,
// deployClass returned nil (success) here; after the fix it must return
// a non-nil error carrying the WriteSource failure message.
func TestDeployClass_ReturnsErrorWhenWriteSourceFails(t *testing.T) {
	cfg := adt.NewConfig("https://sap.example.com:44300", "user", "pass")
	transport := adt.NewTransportWithClient(cfg, stubTransport{})
	client := adt.NewClientWithTransport(cfg, transport)

	obj := deps.DeploymentObject{
		Type:       "CLAS",
		Name:       "ZCL_TEST",
		MainSource: "CLASS zcl_test DEFINITION PUBLIC. ENDCLASS.",
	}

	// Empty packageName forces WriteSource's create-path validation to
	// fail (Package is required) — Success=false, err=nil.
	err := deployClass(context.Background(), client, obj, "")
	if err == nil {
		t.Fatal("deployClass should return an error when WriteSource reports Success=false, got nil")
	}
	if !strings.Contains(err.Error(), "WriteSource failed") {
		t.Errorf("error = %q, want it to mention the WriteSource failure message", err.Error())
	}
}
