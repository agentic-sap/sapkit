package alvhandlers

import "testing"

func TestGetObjects(t *testing.T) {
	objects := GetObjects()

	if len(objects) != 7 {
		t.Fatalf("expected 7 objects, got %d", len(objects))
	}

	if objects[0].Name != "ZIF_S4SAP_CM" {
		t.Errorf("expected first object Name to be ZIF_S4SAP_CM, got %s", objects[0].Name)
	}

	if objects[len(objects)-1].Name != "ZCL_S4SAP_CM_ALV" {
		t.Errorf("expected last object Name to be ZCL_S4SAP_CM_ALV, got %s", objects[len(objects)-1].Name)
	}

	for _, obj := range objects {
		if obj.Source == "" {
			t.Errorf("object %s has empty Source", obj.Name)
		}
	}
}
