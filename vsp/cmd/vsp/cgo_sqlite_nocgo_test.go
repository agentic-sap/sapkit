//go:build !cgo

package main

// cgoSQLiteAvailable is false in CGO_ENABLED=0 builds, where go-sqlite3 links
// only a runtime stub. Audit-cache tests skip themselves when this is false.
const cgoSQLiteAvailable = false
