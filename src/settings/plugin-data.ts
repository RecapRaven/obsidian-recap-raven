import type { RecapRavenSettings } from './settings';
import { normalizeSettings } from './settings';
import type { StoredSessionIdentity } from '../import/session-identity';
import { normalizeStoredSessionIdentities } from '../import/session-identity';

const SESSION_IDENTITY_VERSION = 1;

export interface RecapRavenPluginData {
  readonly settings: RecapRavenSettings;
  readonly sessionIdentities: readonly StoredSessionIdentity[];
}

export function normalizePluginData(value: unknown): RecapRavenPluginData {
  const record = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
  return {
    settings: normalizeSettings(record),
    sessionIdentities: normalizeStoredSessionIdentities(record.sessionIdentities),
  };
}

export function serializePluginData(data: RecapRavenPluginData): Readonly<Record<string, unknown>> {
  return {
    ...data.settings,
    sessionIdentityVersion: SESSION_IDENTITY_VERSION,
    sessionIdentities: data.sessionIdentities,
  };
}
