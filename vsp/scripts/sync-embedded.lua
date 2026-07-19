-- sync-embedded.lua
-- Export $ZADT_VSP package objects to embedded/abap/

local objects = {
    {type = "INTF", name = "ZIF_VSP_SERVICE", file = "zif_vsp_service.intf.abap"},
    {type = "CLAS", name = "ZCL_VSP_APC_HANDLER", file = "zcl_vsp_apc_handler.clas.abap"},
    {type = "CLAS", name = "ZCL_VSP_RFC_SERVICE", file = "zcl_vsp_rfc_service.clas.abap"},
    {type = "CLAS", name = "ZCL_VSP_DEBUG_SERVICE", file = "zcl_vsp_debug_service.clas.abap"},
    {type = "CLAS", name = "ZCL_VSP_AMDP_SERVICE", file = "zcl_vsp_amdp_service.clas.abap"},
    {type = "CLAS", name = "ZCL_VSP_GIT_SERVICE", file = "zcl_vsp_git_service.clas.abap"},
    {type = "CLAS", name = "ZCL_VSP_REPORT_SERVICE", file = "zcl_vsp_report_service.clas.abap"},
}

local output_dir = os.getenv("VSP_OUTPUT_DIR") or "embedded/abap"

print("Exporting $ZADT_VSP objects to " .. output_dir)
print(string.rep("-", 50))

local success = 0
local failed = 0

for _, obj in ipairs(objects) do
    print(string.format("Exporting %s (%s)...", obj.name, obj.type))

    -- Get source from SAP
    local source, err = getSource(obj.type, obj.name)
    if err then
        print("  ERROR: " .. err)
        failed = failed + 1
    else
        -- Write to file
        local filepath = output_dir .. "/" .. obj.file
        local f, ferr = io.open(filepath, "w")
        if f then
            f:write(source)
            f:close()
            print("  OK: " .. filepath)
            success = success + 1
        else
            print("  ERROR writing file: " .. (ferr or "unknown"))
            failed = failed + 1
        end
    end
end

print(string.rep("-", 50))
print(string.format("Done: %d success, %d failed", success, failed))
