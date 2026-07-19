// Package mcp - handlers_standards.go contains handlers for embedded
// ABAP development standards (coding rules, templates, quality checklists).
package mcp

import (
	"context"
	"fmt"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/oisee/vibing-steampunk/embedded/standards"
)

// handleListStandards lists all embedded ABAP development standards.
func (s *Server) handleListStandards(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	var sb strings.Builder
	sb.WriteString("Embedded ABAP development standards. Fetch a document with the GetStandard tool, or SAP(action=\"standards\", target=\"<path>\") in single-tool mode:\n")
	lastCategory := ""
	for _, d := range standards.List() {
		if d.Category != lastCategory {
			sb.WriteString(fmt.Sprintf("\n## %s\n", d.Category))
			lastCategory = d.Category
		}
		sb.WriteString(fmt.Sprintf("- %s — %s\n", d.Path, d.Title))
	}
	return mcp.NewToolResultText(sb.String()), nil
}

// handleGetStandard returns the content of one standards document.
func (s *Server) handleGetStandard(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	path, _ := req.GetArguments()["path"].(string)
	if path == "" {
		return newToolResultError("path is required (e.g. 'rules/naming-conventions.md'); list the embedded standards first to see available documents"), nil
	}
	text, err := standards.Read(path)
	if err != nil {
		return newToolResultError(err.Error()), nil
	}
	return mcp.NewToolResultText(text), nil
}

// registerStandardsResources exposes each standards document as an MCP
// resource under vsp://standards/<path>.
func (s *Server) registerStandardsResources() {
	for _, d := range standards.List() {
		uri := "vsp://standards/" + d.Path
		mimeType := "text/markdown"
		if strings.HasSuffix(d.Path, ".abap") {
			mimeType = "text/plain"
		}
		docPath := d.Path
		s.mcpServer.AddResource(mcp.NewResource(uri, d.Title,
			mcp.WithResourceDescription(fmt.Sprintf("ABAP development standard (%s)", d.Category)),
			mcp.WithMIMEType(mimeType),
		), func(ctx context.Context, req mcp.ReadResourceRequest) ([]mcp.ResourceContents, error) {
			text, err := standards.Read(docPath)
			if err != nil {
				return nil, err
			}
			return []mcp.ResourceContents{mcp.TextResourceContents{
				URI:      uri,
				MIMEType: mimeType,
				Text:     text,
			}}, nil
		})
	}
}
