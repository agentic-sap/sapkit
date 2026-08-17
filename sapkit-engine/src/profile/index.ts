/**
 * Profile layer — home resolution, `sap.env` parsing, and the `ResolvedProfile`
 * the server core consumes.
 */

export { parseEnvText, readEnvFile } from './envFile';
export {
  RUNTIME_DIR_NAME,
  type HomeLookup,
  type HomeResolution,
  listProfileAliases,
  resolveHomeDir,
} from './home';
export {
  type ProfileResolution,
  type ProfileResolveOptions,
  disconnectedProfile,
  resolveProfile,
  resolveProfileDetailed,
} from './resolve';
export {
  type BrokerStores,
  type DestinationSelection,
  type NameCheck,
  type PlatformLookup,
  type PlatformSubfolder,
  type ServiceKeyAuth,
  type ServiceKeyConfig,
  type ServiceKeyPlan,
  type ServiceKeyResult,
  type SessionEnvResult,
  checkDestinationName,
  listStoreNames,
  planServiceKeyConnection,
  platformStoreDirs,
  readServiceKey,
  resolveBrokerStores,
  resolveSessionEnv,
  serviceKeysDir,
  sessionEnvFileName,
  sessionsDir,
} from './destination';
