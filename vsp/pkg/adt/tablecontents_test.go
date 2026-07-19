package adt

import "testing"

// TestParseTableContentsEmptyCellAlignment guards against the empty-cell
// drop/shift corruption class: ADT Data Preview is column-major XML, and a
// parser that drops empty/self-closing cells shortens that column's array so
// later values shift up into the wrong rows. The Go decoder must keep one
// entry per <data> element regardless of content.
func TestParseTableContentsEmptyCellAlignment(t *testing.T) {
	xmlData := `<?xml version="1.0" encoding="utf-8"?>
<dataPreview:tableData xmlns:dataPreview="http://www.sap.com/adt/dataPreview" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dataPreview:totalRows>5</dataPreview:totalRows>
  <dataPreview:columns>
    <dataPreview:metadata dataPreview:name="COL1" dataPreview:type="C" dataPreview:description="col one" dataPreview:keyAttribute="false" dataPreview:length="10"/>
    <dataPreview:dataSet>
      <dataPreview:data>A</dataPreview:data>
      <dataPreview:data/>
      <dataPreview:data></dataPreview:data>
      <dataPreview:data>D</dataPreview:data>
    </dataPreview:dataSet>
  </dataPreview:columns>
  <dataPreview:columns>
    <dataPreview:metadata dataPreview:name="COL2" dataPreview:type="N" dataPreview:description="col two" dataPreview:keyAttribute="false" dataPreview:length="4"/>
    <dataPreview:dataSet>
      <dataPreview:data>1</dataPreview:data>
      <dataPreview:data xsi:nil="true"/>
      <dataPreview:data>3</dataPreview:data>
      <dataPreview:data>4</dataPreview:data>
    </dataPreview:dataSet>
  </dataPreview:columns>
</dataPreview:tableData>`

	result, err := parseTableContents([]byte(xmlData))
	if err != nil {
		t.Fatalf("parseTableContents failed: %v", err)
	}

	if len(result.Rows) != 4 {
		t.Fatalf("expected 4 rows, got %d", len(result.Rows))
	}

	wantCol1 := []interface{}{"A", "", "", "D"}
	wantCol2 := []interface{}{"1", nil, "3", "4"} // xsi:nil cell must be null, not ""
	for i := range wantCol1 {
		if got := result.Rows[i]["COL1"]; got != wantCol1[i] {
			t.Errorf("row %d COL1: got %v, want %v (empty cells must not shift values)", i, got, wantCol1[i])
		}
		if got := result.Rows[i]["COL2"]; got != wantCol2[i] {
			t.Errorf("row %d COL2: got %v, want %v", i, got, wantCol2[i])
		}
	}

	if result.TotalRows != 5 {
		t.Errorf("TotalRows: got %d, want 5", result.TotalRows)
	}
}

func TestMarkTruncation(t *testing.T) {
	tests := []struct {
		name      string
		totalRows int64
		numRows   int
		maxRows   int
		want      bool
	}{
		{"server total exceeds returned", 5, 4, 100, true},
		{"rows hit the cap", 0, 100, 100, true},
		{"complete result", 4, 4, 100, false},
		{"no total, under cap", 0, 4, 100, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := &TableContentsResult{TotalRows: tt.totalRows}
			for i := 0; i < tt.numRows; i++ {
				r.Rows = append(r.Rows, map[string]interface{}{})
			}
			markTruncation(r, tt.maxRows)
			if r.Truncated != tt.want {
				t.Errorf("Truncated: got %v, want %v", r.Truncated, tt.want)
			}
		})
	}
}
