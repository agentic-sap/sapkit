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
  resolveProfile,
  resolveProfileDetailed,
} from './resolve';
