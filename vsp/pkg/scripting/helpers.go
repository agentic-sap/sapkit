package scripting

import (
	"context"
	"encoding/json"
	"time"

	lua "github.com/yuin/gopher-lua"
)

// contextWithTimeout creates a channel that closes after the given duration.
func contextWithTimeout(ctx context.Context, seconds lua.LNumber) <-chan struct{} {
	ch := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			close(ch)
		case <-time.After(time.Duration(float64(seconds) * float64(time.Second))):
			close(ch)
		}
	}()
	return ch
}

// jsonMarshal wraps json.MarshalIndent.
func jsonMarshal(v interface{}) ([]byte, error) {
	return json.MarshalIndent(v, "", "  ")
}

// jsonUnmarshal wraps json.Unmarshal.
func jsonUnmarshal(data []byte, v interface{}) error {
	return json.Unmarshal(data, v)
}

// luaToGo converts a Lua value to a Go value.
func luaToGo(val lua.LValue) interface{} {
	switch v := val.(type) {
	case lua.LBool:
		return bool(v)
	case lua.LNumber:
		// Check if it's an integer
		if float64(v) == float64(int64(v)) {
			return int64(v)
		}
		return float64(v)
	case lua.LString:
		return string(v)
	case *lua.LTable:
		return luaTableToGo(v)
	case *lua.LNilType:
		return nil
	default:
		return val.String()
	}
}

// luaTableToGo converts a Lua table to a Go map or slice.
func luaTableToGo(tbl *lua.LTable) interface{} {
	// Check if it's an array (sequential integer keys starting from 1)
	isArray := true
	maxN := 0
	tbl.ForEach(func(key, _ lua.LValue) {
		if num, ok := key.(lua.LNumber); ok {
			n := int(num)
			if n > maxN {
				maxN = n
			}
		} else {
			isArray = false
		}
	})

	if isArray && maxN > 0 && tbl.Len() == maxN {
		// Convert to slice
		arr := make([]interface{}, maxN)
		for i := 1; i <= maxN; i++ {
			arr[i-1] = luaToGo(tbl.RawGetInt(i))
		}
		return arr
	}

	// Convert to map
	m := make(map[string]interface{})
	tbl.ForEach(func(key, value lua.LValue) {
		keyStr := key.String()
		m[keyStr] = luaToGo(value)
	})
	return m
}

// goToLua converts a Go value to a Lua value.
func goToLua(L *lua.LState, val interface{}) lua.LValue {
	if val == nil {
		return lua.LNil
	}

	switch v := val.(type) {
	case bool:
		return lua.LBool(v)
	case int:
		return lua.LNumber(v)
	case int32:
		return lua.LNumber(v)
	case int64:
		return lua.LNumber(v)
	case float32:
		return lua.LNumber(v)
	case float64:
		return lua.LNumber(v)
	case string:
		return lua.LString(v)
	case []interface{}:
		return goSliceToLua(L, v)
	case map[string]interface{}:
		return goMapToLua(L, v)
	case []map[string]interface{}:
		tbl := L.NewTable()
		for i, item := range v {
			tbl.RawSetInt(i+1, goMapToLua(L, item))
		}
		return tbl
	default:
		// Try JSON marshaling for complex types
		if data, err := json.Marshal(v); err == nil {
			var parsed interface{}
			if json.Unmarshal(data, &parsed) == nil {
				return goToLua(L, parsed)
			}
		}
		return lua.LString(toString(v))
	}
}

// goSliceToLua converts a Go slice to a Lua table.
func goSliceToLua(L *lua.LState, slice []interface{}) *lua.LTable {
	tbl := L.NewTable()
	for i, v := range slice {
		tbl.RawSetInt(i+1, goToLua(L, v))
	}
	return tbl
}

// goMapToLua converts a Go map to a Lua table.
func goMapToLua(L *lua.LState, m map[string]interface{}) *lua.LTable {
	tbl := L.NewTable()
	for k, v := range m {
		tbl.RawSetString(k, goToLua(L, v))
	}
	return tbl
}

// toString converts any value to a string.
func toString(v interface{}) string {
	if s, ok := v.(string); ok {
		return s
	}
	data, err := json.Marshal(v)
	if err != nil {
		return "<error>"
	}
	return string(data)
}

// getString extracts a string argument from Lua.
func getString(L *lua.LState, n int) string {
	return L.ToString(n)
}

// getOptString extracts an optional string argument with default.
func getOptString(L *lua.LState, n int, def string) string {
	if L.GetTop() < n {
		return def
	}
	val := L.Get(n)
	if val == lua.LNil {
		return def
	}
	return L.ToString(n)
}

// getInt extracts an integer argument from Lua.
func getInt(L *lua.LState, n int) int {
	return int(L.ToNumber(n))
}

// getOptInt extracts an optional integer argument with default.
func getOptInt(L *lua.LState, n int, def int) int {
	if L.GetTop() < n {
		return def
	}
	val := L.Get(n)
	if val == lua.LNil {
		return def
	}
	return int(L.ToNumber(n))
}

// getBool extracts a boolean argument from Lua.
func getBool(L *lua.LState, n int) bool {
	return L.ToBool(n)
}

// getTable extracts a table argument from Lua as a map.
func getTable(L *lua.LState, n int) map[string]interface{} {
	val := L.Get(n)
	if tbl, ok := val.(*lua.LTable); ok {
		result := luaTableToGo(tbl)
		if m, ok := result.(map[string]interface{}); ok {
			return m
		}
	}
	return nil
}
