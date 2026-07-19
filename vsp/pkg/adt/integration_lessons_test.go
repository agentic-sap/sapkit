//go:build integration

package adt

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"
)

// TestIntegration_SyntaxCheckGroupWide verifies the artifact-less SyntaxCheck
// mode (content omitted → server checks its persisted source) against a
// standard function group. Read-only.
func TestIntegration_SyntaxCheckGroupWide(t *testing.T) {
	client := getIntegrationClient(t)
	ctx := context.Background()

	results, err := client.SyntaxCheck(ctx, "/sap/bc/adt/functions/groups/srfc", "")
	if err != nil {
		t.Fatalf("artifact-less group syntax check rejected by server: %v", err)
	}
	t.Logf("Group-wide check of SRFC returned %d messages", len(results))
	for i, r := range results {
		if i >= 5 {
			break
		}
		t.Logf("  [%s] %s line %d: %s", r.Severity, r.URI, r.Line, r.Text)
	}
}

// TestIntegration_ActivateGroupE2E verifies the whole-FUGR activation recipe:
// create a function group + FM in $TMP, write FM source, then activate main
// program + includes + FMs + group in ONE activation run.
func TestIntegration_ActivateGroupE2E(t *testing.T) {
	client := getIntegrationClient(t)
	ctx := context.Background()

	timestamp := time.Now().Unix() % 100000
	groupName := fmt.Sprintf("ZMCPAG%05d", timestamp)
	fmName := fmt.Sprintf("Z_MCPAG%05d_FM", timestamp)
	groupURL := "/sap/bc/adt/functions/groups/" + strings.ToLower(groupName)

	t.Logf("Test function group: %s, FM: %s", groupName, fmName)

	// Step 1: Create function group in $TMP
	err := client.CreateObject(ctx, CreateObjectOptions{
		ObjectType:  ObjectTypeFunctionGroup,
		Name:        groupName,
		Description: "ActivateGroup integration test",
		PackageName: "$TMP",
	})
	if err != nil {
		t.Fatalf("Failed to create function group: %v", err)
	}

	defer func() {
		lock, err := client.LockObject(ctx, groupURL, "MODIFY")
		if err != nil {
			t.Logf("Cleanup: failed to lock group for delete: %v", err)
			return
		}
		if err := client.DeleteObject(ctx, groupURL, lock.LockHandle, ""); err != nil {
			t.Logf("Cleanup: failed to delete group: %v", err)
			client.UnlockObject(ctx, groupURL, lock.LockHandle)
		} else {
			t.Log("Cleanup: function group deleted")
		}
	}()

	// Step 2: Create an FM in the group
	err = client.CreateObject(ctx, CreateObjectOptions{
		ObjectType:  ObjectTypeFunctionMod,
		Name:        fmName,
		Description: "ActivateGroup test FM",
		PackageName: "$TMP",
		ParentName:  groupName,
	})
	if err != nil {
		t.Fatalf("Failed to create function module: %v", err)
	}

	// Step 3: Write FM source
	fmURL := fmt.Sprintf("/sap/bc/adt/functions/groups/%s/fmodules/%s",
		strings.ToLower(groupName), strings.ToLower(fmName))

	writeFM := func(source string) {
		t.Helper()
		lock, err := client.LockObject(ctx, fmURL, "MODIFY")
		if err != nil {
			t.Fatalf("Failed to lock FM: %v", err)
		}
		if err := client.UpdateSource(ctx, fmURL+"/source/main", source, lock.LockHandle, ""); err != nil {
			client.UnlockObject(ctx, fmURL, lock.LockHandle)
			t.Fatalf("Failed to write FM source: %v", err)
		}
		if err := client.UnlockObject(ctx, fmURL, lock.LockHandle); err != nil {
			t.Fatalf("Failed to unlock FM: %v", err)
		}
	}

	// Step 3a: Write intentionally BROKEN source, then prove the artifact-less
	// group check actually detects errors (not just returns empty).
	writeFM(fmt.Sprintf(`FUNCTION %s.
  DATA lv_result TYPE i.
  lv_result = this_is_not_declared.
ENDFUNCTION.`, strings.ToLower(fmName)))

	brokenResults, err := client.SyntaxCheck(ctx, groupURL, "")
	if err != nil {
		t.Fatalf("group syntax check on broken source failed: %v", err)
	}
	brokenErrs := 0
	for _, r := range brokenResults {
		if r.Severity == "E" {
			brokenErrs++
			t.Logf("  detected (expected) error: %s line %d: %s", r.URI, r.Line, r.Text)
		}
	}
	if brokenErrs == 0 {
		t.Fatalf("group-wide check found no errors in intentionally broken source - detection not working")
	}
	t.Logf("Group-wide check detected %d error(s) in broken FM - detection verified", brokenErrs)

	// Step 3b: Fix the source
	writeFM(fmt.Sprintf(`FUNCTION %s.
  DATA lv_result TYPE i.
  lv_result = 1 + 1.
ENDFUNCTION.`, strings.ToLower(fmName)))

	// Step 4: Assemble the group reference set
	refs, err := client.GroupActivationRefs(ctx, groupName)
	if err != nil {
		t.Fatalf("GroupActivationRefs failed: %v", err)
	}
	t.Logf("Assembled %d refs:", len(refs))
	for _, r := range refs {
		t.Logf("  %s (%s)", r.URI, r.Name)
	}
	if len(refs) < 3 {
		t.Fatalf("expected at least main program + group + FM, got %d refs", len(refs))
	}

	// Step 5: Activate everything in ONE run
	result, err := client.ActivateMultiple(ctx, refs)
	if err != nil {
		t.Fatalf("ActivateMultiple rejected by server: %v", err)
	}
	for _, m := range result.Messages {
		t.Logf("  activation [%s] %s: %s", m.Type, m.ObjDescr, m.ShortText)
	}
	for _, inact := range result.Inactive {
		t.Logf("  still inactive: %s (%s)", inact.Name, inact.Type)
	}
	if !result.Success {
		t.Fatalf("group activation run reported failure")
	}
	t.Log("Whole-group activation run succeeded")

	// Step 6: Verify with a group-wide syntax check (persisted source)
	checkResults, err := client.SyntaxCheck(ctx, groupURL, "")
	if err != nil {
		t.Fatalf("post-activation group syntax check failed: %v", err)
	}
	errCount := 0
	for _, r := range checkResults {
		if r.Severity == "E" {
			errCount++
			t.Logf("  post-activation error: %s line %d: %s", r.URI, r.Line, r.Text)
		}
	}
	if errCount > 0 {
		t.Fatalf("group has %d syntax errors after activation", errCount)
	}
	t.Log("Post-activation group syntax check clean")
}
