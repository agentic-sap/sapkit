-- analyze-dumps.lua
-- Example: List and analyze short dumps (ST22)

print("Short Dump Analysis")
print("=" .. string.rep("=", 40))

-- Get recent dumps
print("\nFetching recent dumps...")
local dumps = getDumps(10)
if not dumps or #dumps == 0 then
    print("No dumps found")
    return
end

print("\nFound " .. #dumps .. " recent dumps:\n")

for i, dump in ipairs(dumps) do
    print(i .. ". " .. dump.id)
    print("   Program:   " .. dump.program)
    print("   Exception: " .. dump.exception)
    print("   User:      " .. dump.user)
    print("   Time:      " .. dump.time)
    print()
end

-- Get details for first dump
print("=" .. string.rep("=", 40))
print("\nDetails for dump: " .. dumps[1].id)
print()

local details = getDump(dumps[1].id)
if details then
    print("Title: " .. (details.title or "N/A"))
    print("Program: " .. details.program)
    print("Line: " .. (details.line or 0))

    if details.stack and #details.stack > 0 then
        print("\nStack trace:")
        for i, frame in ipairs(details.stack) do
            print("  " .. i .. ". " .. frame.program .. ":" .. frame.line)
        end
    end
else
    print("Could not fetch dump details")
end
