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
  DEFAULT_TIMEOUTS,
  disconnectedProfile,
  resolveProfile,
  resolveProfileDetailed,
} from './resolve';
export {
  type BrokerStores,
  type DestinationSelection,
  type NameCheck,
  type OAuthGrant,
  type PlatformLookup,
  type PlatformSubfolder,
  type ServiceKeyAuth,
  type ServiceKeyConfig,
  type ServiceKeyPlan,
  type ServiceKeyResult,
  type SessionEnvResult,
  DEFAULT_SERVICE_KEY_GRANT,
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
