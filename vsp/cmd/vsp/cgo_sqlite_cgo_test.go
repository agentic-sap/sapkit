//go:build cgo

package main

// cgoSQLiteAvailable reports whether the go-sqlite3 driver can actually run.
// It requires cgo; a CGO_ENABLED=0 build links only a stub that errors at
// runtime. Audit-cache tests use this to skip when the backend is unusable.
const cgoSQLiteAvailable = true
