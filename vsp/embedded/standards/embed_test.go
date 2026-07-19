package standards

import (
	"strings"
	"testing"
)

func TestListContainsAllCategories(t *testing.T) {
	docs := List()
	if len(docs) == 0 {
		t.Fatal("List() returned no documents")
	}
	categories := map[string]int{}
	for _, d := range docs {
		categories[d.Category]++
	}
	for _, want := range []string{"rules", "templates", "quality"} {
		if categories[want] == 0 {
			t.Errorf("no documents embedded in category %q", want)
		}
	}
}

func TestReadByExactPath(t *testing.T) {
	text, err := Read("rules/naming-conventions.md")
	if err != nil {
		t.Fatalf("Read failed: %v", err)
	}
	if !strings.Contains(text, "#") {
		t.Error("expected markdown content")
	}
}

func TestReadByBareName(t *testing.T) {
	if _, err := Read("naming-conventions"); err != nil {
		t.Errorf("bare name lookup failed: %v", err)
	}
	if _, err := Read("main-program.abap"); err != nil {
		t.Errorf("bare ABAP file lookup failed: %v", err)
	}
}

func TestReadNotFound(t *testing.T) {
	if _, err := Read("no-such-doc"); err == nil {
		t.Error("expected error for missing document")
	}
}
