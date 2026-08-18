import { describe, expect, it } from 'vitest';
import { normalizePluginData, serializePluginData } from '../../src/settings/plugin-data';

const SESSION_ID = '123e4567-e89b-42d3-a456-426614174000';

describe('plugin data', () => {
  it('loads legacy settings without an identity index', () => {
    const data = normalizePluginData({
      secretName: 'recap-raven-api-key',
      importFolder: 'Campaign recaps',
      tags: ['recap-raven'],
      createCampaignIndex: false,
    });

    expect(data.settings.importFolder).toBe('Campaign recaps');
    expect(data.sessionIdentities).toEqual([]);
  });

  it('round trips only validated private identity metadata alongside settings', () => {
    const normalized = normalizePluginData({
      secretName: 'recap-raven-api-key',
      importFolder: 'Recap Raven',
      tags: ['recap-raven'],
      createCampaignIndex: true,
      sessionIdentities: [
        { sessionId: SESSION_ID, path: 'Recap Raven/Campaign/Sessions/Recap.md' },
        { sessionId: 'invalid', path: 'Private.md' },
      ],
    });

    expect(serializePluginData(normalized)).toMatchObject({
      sessionIdentityVersion: 1,
      sessionIdentities: [
        { sessionId: SESSION_ID, path: 'Recap Raven/Campaign/Sessions/Recap.md' },
      ],
    });
  });
});
