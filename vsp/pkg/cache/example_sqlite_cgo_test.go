//go:build cgo

package cache_test

import (
	"context"
	"fmt"

	"github.com/oisee/vibing-steampunk/pkg/cache"
)

// Example_withSQLite demonstrates SQLite-backed cache. The sqlite backend
// (go-sqlite3) needs cgo, so this example is compiled only in cgo builds;
// a CGO_ENABLED=0 build would hit the driver's runtime stub instead.
func Example_withSQLite() {
	ctx := context.Background()

	// Create SQLite cache
	config := cache.DefaultConfig()
	config.Type = "sqlite"
	config.Path = "/tmp/test_cache.db"

	c, err := cache.NewCache(config)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}
	defer c.Close()

	// Store a node
	node := &cache.Node{
		ID:         "PROG.ZREPORT",
		ObjectType: "PROG",
		ObjectName: "ZREPORT",
		Package:    "$TMP",
		Valid:      true,
	}

	err = c.PutNode(ctx, node)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}

	// Get stats
	stats, _ := c.Stats(ctx)
	fmt.Printf("Nodes: %d, Valid: %d\n", stats.NodeCount, stats.ValidNodeCount)

	// Output:
	// Nodes: 1, Valid: 1
}
