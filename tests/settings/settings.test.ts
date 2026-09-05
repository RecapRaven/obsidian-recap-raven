import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/settings/settings';

describe('settings', () => {
  it('requires an explicit boolean opt-in for transcript importing', () => {
    for (const includeTranscripts of [undefined, null, false, 'true', 1, {}]) {
      expect(normalizeSettings({ includeTranscripts }).includeTranscripts).toBe(false);
    }
    expect(normalizeSettings({ includeTranscripts: true }).includeTranscripts).toBe(true);
  });
  it('uses conservative defaults for missing data', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('stores only a SecretStorage reference and bounded non-secret preferences', () => {
    const settings = normalizeSettings({
      secretName: 'recap-raven-export',
      apiKey: 'raven_obs_must-not-be-copied',
      importFolder: 'Campaign imports',
      tags: ['#Recap Raven', 'sessions', 'sessions', '<invalid>'],
      createCampaignIndex: false,
      includeTranscripts: false,
    });

    expect(settings).toEqual({
      secretName: 'recap-raven-export',
      importFolder: 'Campaign imports',
      tags: ['Recap-Raven', 'sessions'],
      createCampaignIndex: false,
      includeTranscripts: false,
    });
    expect(settings).not.toHaveProperty('apiKey');
  });

  it('removes control characters and rejects unbounded fields', () => {
    expect(normalizeSettings({
      secretName: `secret\u0000name`,
      importFolder: 'x'.repeat(513),
      tags: [],
    })).toEqual({
      secretName: 'secretname',
      importFolder: DEFAULT_SETTINGS.importFolder,
      tags: DEFAULT_SETTINGS.tags,
      createCampaignIndex: true,
      includeTranscripts: false,
    });
  });
});
