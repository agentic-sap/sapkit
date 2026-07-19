package adt

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

// captureMock is a transport mock that records request bodies per path key
// and can serve a sequence of responses for the same path (for retry tests).
type captureMock struct {
	seq    map[string][]*http.Response
	static map[string]func() *http.Response
	bodies map[string][]string
}

func (m *captureMock) Do(req *http.Request) (*http.Response, error) {
	path := req.URL.Path
	var body string
	if req.Body != nil {
		b, _ := io.ReadAll(req.Body)
		body = string(b)
	}
	record := func(key string) {
		if m.bodies == nil {
			m.bodies = map[string][]string{}
		}
		m.bodies[key] = append(m.bodies[key], body)
	}
	for key, q := range m.seq {
		if strings.Contains(path, key) && len(q) > 0 {
			m.seq[key] = q[1:]
			record(key)
			return q[0], nil
		}
	}
	for key, mk := range m.static {
		if strings.Contains(path, key) {
			record(key)
			return mk(), nil
		}
	}
	return &http.Response{
		StatusCode: http.StatusNotFound,
		Body:       io.NopCloser(strings.NewReader("Not found")),
		Header:     http.Header{},
	}, nil
}

func newCaptureClient(mock *captureMock) *Client {
	cfg := NewConfig("https://sap.example.com:44300", "user", "pass")
	return NewClientWithTransport(cfg, NewTransportWithClient(cfg, mock))
}

func mkResponse(status int, body string) func() *http.Response {
	return func() *http.Response {
		h := http.Header{}
		h.Set("X-CSRF-Token", "test-token") // Set canonicalizes the key so Header.Get finds it
		return &http.Response{
			StatusCode: status,
			Body:       io.NopCloser(strings.NewReader(body)),
			Header:     h,
		}
	}
}

func TestActivateMultipleBuildsMultiRefBody(t *testing.T) {
	mock := &captureMock{
		static: map[string]func() *http.Response{
			"activation": mkResponse(200, ""),
			"discovery":  mkResponse(200, "OK"),
		},
	}
	client := newCaptureClient(mock)

	refs := []ActivationRef{
		{URI: "/sap/bc/adt/programs/programs/saplzfg", Name: "SAPLZFG"},
		{URI: "/sap/bc/adt/functions/groups/zfg/includes/lzfgtop", Name: "LZFGTOP"},
		{URI: "/sap/bc/adt/functions/groups/zfg/fmodules/z_fm1", Name: "Z_FM1"},
		{URI: "/sap/bc/adt/functions/groups/zfg", Name: "ZFG"},
	}
	result, err := client.ActivateMultiple(context.Background(), refs)
	if err != nil {
		t.Fatalf("ActivateMultiple failed: %v", err)
	}
	if !result.Success {
		t.Errorf("expected Success=true for empty activation response")
	}

	bodies := mock.bodies["activation"]
	if len(bodies) != 1 {
		t.Fatalf("expected 1 activation POST, got %d", len(bodies))
	}
	body := bodies[0]
	if got := strings.Count(body, "<adtcore:objectReference "); got != 4 {
		t.Errorf("expected 4 objectReference entries in one run, got %d\nbody:\n%s", got, body)
	}
	for _, r := range refs {
		if !strings.Contains(body, `adtcore:uri="`+r.URI+`"`) {
			t.Errorf("body missing reference %s", r.URI)
		}
	}
}

func TestGroupActivationRefs(t *testing.T) {
	structureXML := `<?xml version="1.0" encoding="UTF-8"?>
<objectStructure:objectStructureElement xmlns:objectStructure="http://www.sap.com/adt/relations/objectstructure" xmlns:adtcore="http://www.sap.com/adt/core" xmlns:atom="http://www.w3.org/2005/Atom" adtcore:name="ZFG" adtcore:type="FUGR/F">
  <atom:link href="/sap/bc/adt/functions/groups/zfg/source/main" rel="http://www.sap.com/adt/relations/source/definitionIdentifier"/>
  <objectStructure:objectStructureElement adtcore:name="LZFGTOP" adtcore:type="FUGR/I">
    <atom:link href="/sap/bc/adt/functions/groups/zfg/includes/lzfgtop/source/main" rel="http://www.sap.com/adt/relations/source/definitionIdentifier"/>
  </objectStructure:objectStructureElement>
  <objectStructure:objectStructureElement adtcore:name="LZFGUXX" adtcore:type="FUGR/I">
    <atom:link href="/sap/bc/adt/functions/groups/zfg/includes/lzfguxx/source/main" rel="http://www.sap.com/adt/relations/source/definitionIdentifier"/>
  </objectStructure:objectStructureElement>
  <objectStructure:objectStructureElement adtcore:name="Z_FM1" adtcore:type="FUGR/FF">
    <atom:link href="/sap/bc/adt/functions/groups/zfg/fmodules/z_fm1/source/main" rel="http://www.sap.com/adt/relations/source/definitionIdentifier"/>
  </objectStructure:objectStructureElement>
</objectStructure:objectStructureElement>`

	mock := &captureMock{
		static: map[string]func() *http.Response{
			"objectstructure": mkResponse(200, structureXML),
			"discovery":       mkResponse(200, "OK"),
		},
	}
	client := newCaptureClient(mock)

	refs, err := client.GroupActivationRefs(context.Background(), "zfg")
	if err != nil {
		t.Fatalf("GroupActivationRefs failed: %v", err)
	}

	want := map[string]bool{
		"/sap/bc/adt/programs/programs/saplzfg":            false, // main program
		"/sap/bc/adt/functions/groups/zfg":                 false, // group itself (from root link, deduped)
		"/sap/bc/adt/functions/groups/zfg/includes/lzfgtop": false,
		"/sap/bc/adt/functions/groups/zfg/fmodules/z_fm1":   false,
	}
	for _, r := range refs {
		if strings.Contains(r.URI, "uxx") {
			t.Errorf("system UXX include must be excluded (editor-locked by SAP*), got %s", r.URI)
			continue
		}
		if _, ok := want[r.URI]; !ok {
			t.Errorf("unexpected ref %s", r.URI)
			continue
		}
		if want[r.URI] {
			t.Errorf("duplicate ref %s", r.URI)
		}
		want[r.URI] = true
	}
	for uri, seen := range want {
		if !seen {
			t.Errorf("missing ref %s", uri)
		}
	}
	if len(refs) != len(want) {
		t.Errorf("expected %d refs, got %d", len(want), len(refs))
	}
	if refs[0].URI != "/sap/bc/adt/programs/programs/saplzfg" {
		t.Errorf("main program must come first, got %s", refs[0].URI)
	}
}

func TestSyntaxCheckWithoutContentOmitsArtifacts(t *testing.T) {
	emptyReport := `<?xml version="1.0" encoding="UTF-8"?>
<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun"/>`

	mock := &captureMock{
		static: map[string]func() *http.Response{
			"checkruns": mkResponse(200, emptyReport),
			"discovery": mkResponse(200, "OK"),
		},
	}
	client := newCaptureClient(mock)

	results, err := client.SyntaxCheck(context.Background(), "/sap/bc/adt/functions/groups/zfg", "")
	if err != nil {
		t.Fatalf("SyntaxCheck failed: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results, got %d", len(results))
	}

	bodies := mock.bodies["checkruns"]
	if len(bodies) != 1 {
		t.Fatalf("expected 1 checkrun POST, got %d", len(bodies))
	}
	body := bodies[0]
	if strings.Contains(body, "artifact") {
		t.Errorf("artifact-less mode must not send artifacts:\n%s", body)
	}
	if !strings.Contains(body, `adtcore:uri="/sap/bc/adt/functions/groups/zfg"`) {
		t.Errorf("body missing checkObject URI:\n%s", body)
	}
}

func TestGetTableContentsRetriesOn400(t *testing.T) {
	tableXML := `<?xml version="1.0" encoding="utf-8"?>
<dataPreview:tableData xmlns:dataPreview="http://www.sap.com/adt/dataPreview">
  <dataPreview:columns>
    <dataPreview:metadata dataPreview:name="COL1" dataPreview:type="C" dataPreview:description="c" dataPreview:keyAttribute="false" dataPreview:length="10"/>
    <dataPreview:dataSet>
      <dataPreview:data>A</dataPreview:data>
    </dataPreview:dataSet>
  </dataPreview:columns>
</dataPreview:tableData>`

	mock := &captureMock{
		seq: map[string][]*http.Response{
			"datapreview": {
				mkResponse(400, "Bad Request")(),
				mkResponse(200, tableXML)(),
			},
		},
		static: map[string]func() *http.Response{
			"discovery": mkResponse(200, "OK"),
		},
	}
	client := newCaptureClient(mock)

	result, err := client.GetTableContents(context.Background(), "T000", 10, "")
	if err != nil {
		t.Fatalf("GetTableContents should succeed after one 400 retry: %v", err)
	}
	if len(result.Rows) != 1 {
		t.Errorf("expected 1 row after retry, got %d", len(result.Rows))
	}
	if remaining := len(mock.seq["datapreview"]); remaining != 0 {
		t.Errorf("expected both responses consumed (1 fail + 1 retry), %d left", remaining)
	}
}
