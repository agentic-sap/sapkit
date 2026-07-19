// Package alvhandlers provides embedded reusable ALV/Tree OOP handler
// classes (ZCL_S4SAP_CM_*) deployed to SAP via InstallALVHandlers.
package alvhandlers

import _ "embed"

//go:embed zif_s4sap_cm.intf.abap
var ZifS4sapCm string

//go:embed zcx_s4sap_excp.clas.abap
var ZcxS4sapExcp string

//go:embed zcl_s4sap_cm_oalv.clas.abap
var ZclS4sapCmOalv string

//go:embed zcl_s4sap_cm_otree.clas.abap
var ZclS4sapCmOtree string

//go:embed zcl_s4sap_cm_alv_event.clas.abap
var ZclS4sapCmAlvEvent string

//go:embed zcl_s4sap_cm_tree_event.clas.abap
var ZclS4sapCmTreeEvent string

//go:embed zcl_s4sap_cm_alv.clas.abap
var ZclS4sapCmAlv string

// ObjectInfo describes an embedded ABAP object.
type ObjectInfo struct {
	Type        string // INTF or CLAS
	Name        string // e.g. ZIF_S4SAP_CM
	Source      string
	Description string
	Optional    bool
}

// GetObjects returns all ZCL_S4SAP_CM_* objects in deployment order.
func GetObjects() []ObjectInfo {
	return []ObjectInfo{
		{
			Type:        "INTF",
			Name:        "ZIF_S4SAP_CM",
			Source:      ZifS4sapCm,
			Description: "Common interface: dynamic table creation, SALV event signatures",
			Optional:    false,
		},
		{
			Type:        "CLAS",
			Name:        "ZCX_S4SAP_EXCP",
			Source:      ZcxS4sapExcp,
			Description: "Standard exception class (message class S_UNIFIED_CON)",
			Optional:    false,
		},
		{
			Type:        "CLAS",
			Name:        "ZCL_S4SAP_CM_OALV",
			Source:      ZclS4sapCmOalv,
			Description: "OO ALV grid handler base",
			Optional:    false,
		},
		{
			Type:        "CLAS",
			Name:        "ZCL_S4SAP_CM_OTREE",
			Source:      ZclS4sapCmOtree,
			Description: "OO Tree handler base",
			Optional:    false,
		},
		{
			Type:        "CLAS",
			Name:        "ZCL_S4SAP_CM_ALV_EVENT",
			Source:      ZclS4sapCmAlvEvent,
			Description: "ALV event handler (double_click, hotspot, toolbar, user_command)",
			Optional:    false,
		},
		{
			Type:        "CLAS",
			Name:        "ZCL_S4SAP_CM_TREE_EVENT",
			Source:      ZclS4sapCmTreeEvent,
			Description: "Tree event handler",
			Optional:    false,
		},
		{
			Type:        "CLAS",
			Name:        "ZCL_S4SAP_CM_ALV",
			Source:      ZclS4sapCmAlv,
			Description: "Universal ALV wrapper: SALV-factory field catalog + CL_GUI_ALV_GRID integration",
			Optional:    false,
		},
	}
}
