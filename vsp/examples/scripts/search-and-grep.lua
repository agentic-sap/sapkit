-- search-and-grep.lua
-- Example: Search for classes and grep for patterns

-- Search for all classes starting with ZCL_
print("Searching for ZCL_* classes...")
local results = searchObject("ZCL_*", 10)

if not results then
    print("No results found")
    return
end

print("Found " .. #results .. " classes:")
for i, obj in ipairs(results) do
    print("  " .. i .. ". " .. obj.name .. " (" .. obj.type .. ")")
end

-- Grep for a pattern in the first result
if #results > 0 then
    print("\nGrepping for 'METHOD' in first 5 classes...")
    local matches = grepObjects("METHOD", "ZCL_*", 0)

    if matches and #matches > 0 then
        print("Found " .. #matches .. " matches:")
        for i, match in ipairs(matches) do
            if i <= 10 then
                print("  " .. match.name .. ":" .. match.line .. " - " .. match.content:sub(1, 60))
            end
        end
    end
end
