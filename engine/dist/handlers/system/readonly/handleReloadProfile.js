"use strict";
/**
 * ReloadProfile Handler — reload the active profile and reset the SAP connection.
 *
 * Reads `<cwd>/.sapkit/active-profile.txt`, loads the
 * referenced profile env from `~/.sapkit/profiles/<alias>/sap.env`
 * overwrites `process.env.SAP_*`,
 * invalidates the cached connection, and returns metadata about the newly
 * active profile. The next tool call rebuilds the ABAP connection from the
 * fresh env automatically via the existing `notifyConnectionResetListeners`
 * fan-out.
 *
 * This tool is always allowed regardless of tier (handled in readonlyGuard).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOL_DEFINITION = void 0;
exports.handleReloadProfile = handleReloadProfile;
const profile_1 = require("../../../lib/profile");
const utils_1 = require("../../../lib/utils");
exports.TOOL_DEFINITION = {
    name: 'ReloadProfile',
    available_in: ['onprem', 'cloud', 'legacy'],
    description: '[system] Reload the active SAP profile from .sapkit/active-profile.txt and reset the cached connection. Called by the sapkit plugin after switching profiles. Returns the newly active alias, host, tier, and readonly status. If the server was started without connection parameters (inspection-only), this CANNOT restore the connection: it returns restartRequired=true and the MCP server must be restarted.',
    inputSchema: {
        type: 'object',
        properties: {},
        required: [],
    },
};
async function handleReloadProfile(context, _args) {
    const { logger } = context;
    try {
        // Set by the launcher when it fell back to the mock broker. That broker is
        // captured by the server at startup, so reloading the profile refreshes the
        // environment but can never revive the connection in this process.
        const inspectionOnly = Boolean(global.__mcpAbapAdtInspectionOnly);
        const loaded = (0, profile_1.activateProfile)();
        (0, utils_1.invalidateConnectionCache)();
        const host = loaded.envVars.SAP_URL ?? '';
        const client = loaded.envVars.SAP_CLIENT ?? '';
        const description = loaded.envVars.SAP_DESCRIPTION ?? '';
        logger?.info(`[ReloadProfile] alias=${loaded.alias ?? '(legacy)'} tier=${loaded.tier} readonly=${loaded.readonly} host=${host} client=${client}`);
        return (0, utils_1.return_response)({
            data: JSON.stringify({
                ok: true,
                alias: loaded.alias ?? null,
                legacy: loaded.legacy,
                tier: loaded.tier,
                readonly: loaded.readonly,
                host,
                client,
                description,
                sourcePath: loaded.sourcePath,
                restartRequired: inspectionOnly,
                note: inspectionOnly
                    ? 'The server started in inspection-only mode (no connection parameters), so its SAP ' +
                        'connection broker is a mock that ReloadProfile cannot replace. The profile was ' +
                        'reloaded into the environment, but every SAP call keeps failing until the MCP ' +
                        'server itself is restarted (reconnect the MCP server, or restart the client).'
                    : undefined,
            }, null, 2),
        });
    }
    catch (error) {
        logger?.error('[ReloadProfile] error:', error);
        return (0, utils_1.return_error)(error);
    }
}
//# sourceMappingURL=handleReloadProfile.js.map