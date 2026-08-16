import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/settings/settings';

describe('settings', () => {
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
    });

    expect(settings).toEqual({
      secretName: 'recap-raven-export',
      importFolder: 'Campaign imports',
      tags: ['Recap-Raven', 'sessions'],
      createCampaignIndex: false,
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
    });
  });
});
