-- debug-session.lua
-- Example: Set breakpoint and wait for debuggee

-- Configuration
local PROGRAM = arg and arg[1] or "ZTEST_MCP_CRUD"
local LINE = arg and arg[2] and tonumber(arg[2]) or 10
local TIMEOUT = 60

print("vsp Debug Session Example")
print("=" .. string.rep("=", 40))

-- Step 1: Set a breakpoint
print("\n1. Setting breakpoint on " .. PROGRAM .. " line " .. LINE .. "...")
local bpId, bpErr = setBreakpoint(PROGRAM, LINE)
if not bpId then
    print("   Error: " .. (bpErr or "unknown"))
    return
end
print("   Breakpoint ID: " .. bpId)

-- Step 2: List current breakpoints
print("\n2. Current breakpoints:")
local bps = getBreakpoints()
if bps then
    for i, bp in ipairs(bps) do
        print("   " .. i .. ". " .. bp.id .. " at " .. bp.uri .. ":" .. bp.line)
    end
else
    print("   None")
end

-- Step 3: Wait for debuggee
print("\n3. Waiting for debuggee (timeout: " .. TIMEOUT .. "s)...")
print("   Trigger execution of " .. PROGRAM .. " in SAP GUI or via unit test")
local event, eventErr = listen(TIMEOUT)
if not event then
    print("   " .. (eventErr or "Timeout - no debuggee caught"))
    return
end

print("   Caught debuggee!")
print("   - ID: " .. event.id)
print("   - Program: " .. event.program)
print("   - Line: " .. event.line)

-- Step 4: Attach to debuggee
print("\n4. Attaching to debuggee...")
local session, attachErr = attach(event.id)
if not session then
    print("   Error: " .. (attachErr or "unknown"))
    return
end
print("   Session ID: " .. session.session_id)

-- Step 5: Get stack trace
print("\n5. Stack trace:")
local stack = getStack()
if stack then
    for i, frame in ipairs(stack) do
        print("   " .. i .. ". " .. frame.program .. ":" .. frame.line .. " [" .. frame.type .. "]")
    end
end

-- Step 6: Step over
print("\n6. Stepping over...")
local step = stepOver()
if step then
    print("   Session: " .. (step.session_id or "active"))
    print("   Can step: " .. tostring(step.stepping))
end

-- Step 7: Detach
print("\n7. Detaching...")
detach()
print("   Done!")

-- Step 8: Clean up breakpoints
print("\n8. Cleaning up breakpoints...")
deleteBreakpoint(bpId)
print("   Breakpoint deleted")
