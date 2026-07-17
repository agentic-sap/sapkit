"use strict";
/**
 * CreateMetadataExtension Handler - ABAP Metadata Extension Creation via ADT API
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOL_DEFINITION = void 0;
exports.handleCreateMetadataExtension = handleCreateMetadataExtension;
const adtLogonLanguage_1 = require("../../../lib/adtLogonLanguage");
const clients_1 = require("../../../lib/clients");
const preCheckBeforeActivation_1 = require("../../../lib/preCheckBeforeActivation");
const utils_1 = require("../../../lib/utils");
const transportValidation_js_1 = require("../../../utils/transportValidation.js");
exports.TOOL_DEFINITION = {
    name: 'CreateMetadataExtension',
    available_in: ['onprem', 'cloud'],
    description: 'Create a new ABAP Metadata Extension (DDLX) in SAP system. Defines Fiori UI annotations, field labels, search help, and list/object page layout for CDS views.',
    inputSchema: {
        type: 'object',
        properties: {
            name: {
                type: 'string',
                description: 'Metadata Extension name',
            },
            description: {
                type: 'string',
                description: 'Description',
            },
            package_name: {
                type: 'string',
                description: 'Package name',
            },
            transport_request: {
                type: 'string',
                description: 'Transport request number',
            },
            activate: {
                type: 'boolean',
                description: 'Activate after creation. Default: true',
            },
        },
        required: ['name', 'package_name'],
    },
};
async function handleCreateMetadataExtension(context, params) {
    const { connection, logger } = context;
    const args = params;
    if (!args.name || !args.package_name) {
        return (0, utils_1.return_error)(new Error('Missing required parameters'));
    }
    try {
        (0, transportValidation_js_1.validateTransportRequest)(args.package_name, args.transport_request);
    }
    catch (error) {
        return (0, utils_1.return_error)(error);
    }
    const name = args.name.toUpperCase();
    logger?.info(`Starting DDLX creation: ${name}`);
    try {
        const client = (0, clients_1.createAdtClient)(connection);
        const shouldActivate = args.activate !== false;
        // Resolve the system's logon/master language so the create payload stamps
        // the description into the right language slot. The DDLX builder already
        // threaded masterLanguage into adtcore:masterLanguage but still hardcoded
        // adtcore:language="EN", so on a non-EN logon system the description landed
        // in the EN slot and read back empty (HANDOFF §6 backlog 11-⑫). Falls back
        // to EN when systeminformation is unavailable.
        const masterLanguage = await (0, adtLogonLanguage_1.resolveLogonLanguage)(connection, logger);
        // Create
        await client.getMetadataExtension().create({
            name,
            description: args.description || name,
            packageName: args.package_name,
            transportRequest: args.transport_request || '',
            masterLanguage,
        });
        // Lock
        const lockHandle = await client.getMetadataExtension().lock({ name: name });
        // Keep the ENQUEUE lock alive for the rest of the chain: lock() returns
        // with the connection reset to stateless, and on backends that recycle
        // the HTTP connection (e.g. IDES) the stateless post-create /checkruns
        // POST below tears down the stateful ADT session while the lock is
        // held, so the lock evaporates and the subsequent unlock fails with
        // HTTP 423 "invalid lock handle" — the create is then reported as
        // failed even though it succeeded. Same fix class as UpdateClass
        // 4.13.3 / vsp issue #88 (full pathology: handleUpdateClass.ts).
        // unlock() restores stateless.
        connection.setSessionType('stateful');
        try {
            // Post-create syntax check on the staged inactive version.
            // Surfaces ALL compile errors with structured diagnostics.
            // NOTE: SAP's /checkruns reporter is known to be weak for DDLX
            // — this may return empty for some error classes.
            const checkResult = await (0, preCheckBeforeActivation_1.runSyntaxCheck)({ connection, logger }, { kind: 'metadataExtension', name });
            (0, preCheckBeforeActivation_1.assertNoCheckErrors)(checkResult, 'Metadata Extension', name);
            // Unlock
            await client.getMetadataExtension().unlock({ name: name }, lockHandle);
            // Activate if requested
            if (shouldActivate) {
                await client.getMetadataExtension().activate({ name: name });
            }
        }
        catch (error) {
            // Unlock on error (principle 1: if lock was done, unlock is mandatory)
            try {
                await client.getMetadataExtension().unlock({ name: name }, lockHandle);
            }
            catch (unlockError) {
                logger?.error(`Failed to unlock metadata extension after error: ${unlockError instanceof Error ? unlockError.message : String(unlockError)}`);
            }
            // Principle 2: first error and exit
            throw error;
        }
        const result = {
            success: true,
            name: name,
            package_name: args.package_name,
            type: 'DDLX',
            message: shouldActivate
                ? `Metadata Extension ${name} created and activated successfully`
                : `Metadata Extension ${name} created successfully`,
        };
        return (0, utils_1.return_response)({
            data: JSON.stringify(result, null, 2),
            status: 200,
            statusText: 'OK',
            headers: {},
            config: {},
        });
    }
    catch (error) {
        // PreCheck syntax-check failures carry full structured diagnostics —
        // forward them as-is so the caller sees every error with line numbers.
        if (error?.isPreCheckFailure) {
            logger?.error(`Error creating DDLX ${name}: ${error.message}`);
            return (0, utils_1.return_error)(error);
        }
        logger?.error(`Error creating DDLX ${name}: ${error?.message || error}`);
        return (0, utils_1.return_error)(error);
    }
}
//# sourceMappingURL=handleCreateMetadataExtension.js.map