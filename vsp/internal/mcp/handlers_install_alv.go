// Package mcp provides the MCP server implementation for ABAP ADT tools.
// handlers_install_alv.go contains the handler for installing the reusable
// ALV/Tree OOP handler classes (ZCL_S4SAP_CM_*) referenced by the embedded
// standards OOP pattern template.
package mcp

import (
	"context"
	"fmt"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	alvhandlers "github.com/oisee/vibing-steampunk/embedded/alvhandlers"
	"github.com/oisee/vibing-steampunk/pkg/adt"
)

func (s *Server) handleInstallALVHandlers(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	// Parse parameters
	packageName := "$ZS4SAP_CM"
	if pkg, ok := request.GetArguments()["package"].(string); ok && pkg != "" {
		packageName = strings.ToUpper(pkg)
	}

	checkOnly := false
	if check, ok := request.GetArguments()["check_only"].(bool); ok {
		checkOnly = check
	}

	// Validate package name
	if !strings.HasPrefix(packageName, "$") {
		return newToolResultError("Package name must start with $ (local package)"), nil
	}

	var sb strings.Builder
	sb.WriteString("ALV/Tree OOP Handlers Installation\n")
	sb.WriteString("==================================\n\n")

	// Phase 1: Check prerequisites
	sb.WriteString("Checking prerequisites...\n")

	// Check if package exists (verify URI is populated - empty URI means package doesn't really exist)
	packageExists := false
	pkg, err := s.adtClient.GetPackage(ctx, packageName)
	if err == nil && pkg.URI != "" {
		packageExists = true
		fmt.Fprintf(&sb, "  ✓ Package %s exists\n", packageName)
	} else {
		fmt.Fprintf(&sb, "  → Package %s will be created\n", packageName)
	}

	// Check existing objects
	objects := alvhandlers.GetObjects()
	existingObjects := []string{}
	for _, obj := range objects {
		results, err := s.adtClient.SearchObject(ctx, obj.Name, 1)
		if err == nil && len(results) > 0 {
			existingObjects = append(existingObjects, obj.Name)
		}
	}
	if len(existingObjects) > 0 {
		fmt.Fprintf(&sb, "  ⚠ Existing objects will be updated: %s\n", strings.Join(existingObjects, ", "))
	}

	sb.WriteString("\n")

	// If check_only, stop here
	if checkOnly {
		sb.WriteString("Check complete (--check_only mode, no changes made).\n\n")
		sb.WriteString("Objects to deploy:\n")
		for i, obj := range objects {
			fmt.Fprintf(&sb, "  [%d/%d] %s - %s\n", i+1, len(objects), obj.Name, obj.Description)
		}
		return mcp.NewToolResultText(sb.String()), nil
	}

	// Temporarily allow the install target package to bypass SAP_ALLOWED_PACKAGES restrictions.
	// Install operations are self-contained bootstrap operations that should not be blocked.
	cleanupPkgSafety := s.adtClient.AllowPackageTemporarily(packageName)
	defer cleanupPkgSafety()

	// Phase 2: Create package if needed
	if !packageExists {
		fmt.Fprintf(&sb, "Creating package %s...\n", packageName)
		createOpts := adt.CreateObjectOptions{
			ObjectType:  adt.ObjectTypePackage,
			Name:        packageName,
			Description: "ALV/Tree OOP Handler Classes",
		}
		err := s.adtClient.CreateObject(ctx, createOpts)
		if err != nil {
			// On older SAP releases (e.g. 7.40), /sap/bc/adt/packages may not exist.
			// Don't abort — the package may have been pre-created via SE21/SE80,
			// and WriteSource will fail with a clear error if it truly doesn't exist.
			fmt.Fprintf(&sb, "  ⚠ Package creation failed: %v\n", err)
			fmt.Fprintf(&sb, "  → Continuing anyway (package may already exist via SE21/SE80)\n\n")
		} else {
			fmt.Fprintf(&sb, "  ✓ Package %s created\n\n", packageName)
		}
	} else {
		fmt.Fprintf(&sb, "Using existing package %s\n\n", packageName)
	}

	// Phase 3: Deploy objects (in dependency order: interface, exception, base classes, event, main)
	sb.WriteString("Deploying ABAP objects...\n")

	deployed := []string{}
	failed := []string{}

	for i, obj := range objects {
		fmt.Fprintf(&sb, "  [%d/%d] %s ", i+1, len(objects), obj.Name)

		// Use WriteSource to create/update (WriteSource handles lock/write/unlock/activate)
		opts := &adt.WriteSourceOptions{
			Package: packageName,
			Mode:    adt.WriteModeUpsert,
		}
		result, err := s.adtClient.WriteSource(ctx, obj.Type, obj.Name, obj.Source, opts)
		if err != nil {
			fmt.Fprintf(&sb, "✗ Failed: %v\n", err)
			failed = append(failed, obj.Name+": "+err.Error())
		} else if !result.Success {
			// WriteSource signals a rejected write (e.g. syntax error) via
			// nil error + result.Success == false — counting that as
			// deployed would falsely report success (322320f precedent).
			fmt.Fprintf(&sb, "✗ Failed: %s\n", result.Message)
			failed = append(failed, obj.Name+": "+result.Message)
		} else {
			sb.WriteString("✓ Deployed\n")
			deployed = append(deployed, obj.Name)
		}
	}

	sb.WriteString("\n")

	// Summary
	sb.WriteString("═══════════════════════════════════════════════════════════════════════════════\n")
	if len(failed) > 0 {
		sb.WriteString("  DEPLOYMENT PARTIALLY FAILED\n")
		sb.WriteString("═══════════════════════════════════════════════════════════════════════════════\n\n")
		sb.WriteString("Failed objects:\n")
		for _, f := range failed {
			fmt.Fprintf(&sb, "  • %s\n", f)
		}
	} else {
		sb.WriteString("  DEPLOYMENT COMPLETE\n")
		sb.WriteString("═══════════════════════════════════════════════════════════════════════════════\n")
	}

	fmt.Fprintf(&sb, "\nDeployed: %d, Failed: %d\n\n", len(deployed), len(failed))

	sb.WriteString("These reuse classes are the ones referenced by the embedded standards OOP pattern\n")
	sb.WriteString("template (see GetStandard rules/oop-pattern.md). Point new ALV/Tree report classes\n")
	sb.WriteString("at ZCL_S4SAP_CM_* instead of duplicating handler logic.\n\n")

	sb.WriteString("NOTE: ZCX_S4SAP_EXCP references message class S_UNIFIED_CON for message texts. ")
	sb.WriteString("If it does not exist in this system, exception texts will be missing at runtime — ")
	sb.WriteString("create it via SE91 if needed.\n")

	return mcp.NewToolResultText(sb.String()), nil
}
