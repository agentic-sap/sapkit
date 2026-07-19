-- call-graph-analysis.lua
-- Example: Analyze call graph for an object

local objectURI = arg and arg[1] or "/sap/bc/adt/programs/programs/ZSAMPLE"

print("Analyzing call graph for: " .. objectURI)
print("=" .. string.rep("=", 50))

-- Get callees (what this object calls)
print("\nCallees (downstream dependencies):")
local callees = getCalleesOf(objectURI, 2)
if callees and callees.name then
    printNode(callees, 0)
else
    print("  No callees found or error occurred")
end

-- Get callers (what calls this object)
print("\nCallers (upstream dependencies):")
local callers = getCallersOf(objectURI, 2)
if callers and callers.name then
    printNode(callers, 0)
else
    print("  No callers found or error occurred")
end

-- Helper function to print tree
function printNode(node, depth)
    local indent = string.rep("  ", depth)
    print(indent .. "- " .. node.name .. " (" .. (node.type or "unknown") .. ")")

    if node.children then
        for _, child in ipairs(node.children) do
            printNode(child, depth + 1)
        end
    end
end
