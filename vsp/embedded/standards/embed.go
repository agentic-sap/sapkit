// Package standards provides embedded ABAP development standards:
// coding rules, program skeleton templates, and quality checklists.
// They are served to AI agents via the ListStandards/GetStandard MCP
// tools and as vsp://standards/* MCP resources.
package standards

import (
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strings"
)

//go:embed rules templates quality
var content embed.FS

// Doc describes one embedded standards document.
type Doc struct {
	Path     string // e.g. "rules/naming-conventions.md"
	Category string // "rules", "templates" or "quality"
	Title    string // first markdown heading, or file name for ABAP sources
}

// List returns all embedded documents sorted by path.
func List() []Doc {
	var docs []Doc
	fs.WalkDir(content, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		docs = append(docs, Doc{
			Path:     p,
			Category: strings.SplitN(p, "/", 2)[0],
			Title:    titleOf(p),
		})
		return nil
	})
	sort.Slice(docs, func(i, j int) bool { return docs[i].Path < docs[j].Path })
	return docs
}

// Read returns the content of one document. The path may be given without
// the .md extension or as a bare file name when unambiguous.
func Read(p string) (string, error) {
	p = strings.ToLower(strings.ReplaceAll(strings.TrimSpace(p), "\\", "/"))
	for _, c := range []string{p, p + ".md"} {
		if b, err := content.ReadFile(c); err == nil {
			return string(b), nil
		}
	}
	base := strings.TrimSuffix(p, ".md")
	var matches []string
	for _, d := range List() {
		name := d.Path[strings.LastIndex(d.Path, "/")+1:]
		if name == base || strings.TrimSuffix(name, ".md") == base {
			matches = append(matches, d.Path)
		}
	}
	switch len(matches) {
	case 1:
		b, err := content.ReadFile(matches[0])
		if err != nil {
			return "", err
		}
		return string(b), nil
	case 0:
		return "", fmt.Errorf("standard %q not found; list the embedded standards to see available paths", p)
	default:
		return "", fmt.Errorf("ambiguous name %q, candidates: %s", p, strings.Join(matches, ", "))
	}
}

// titleOf extracts the first markdown heading, falling back to the file name.
func titleOf(p string) string {
	if strings.HasSuffix(p, ".md") {
		if b, err := content.ReadFile(p); err == nil {
			for _, line := range strings.Split(string(b), "\n") {
				line = strings.TrimSpace(line)
				if strings.HasPrefix(line, "# ") {
					return strings.TrimSpace(strings.TrimPrefix(line, "# "))
				}
			}
		}
	}
	return p[strings.LastIndex(p, "/")+1:]
}
