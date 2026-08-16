import type { App, Plugin } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { RecapRavenSettingTab } from '../../src/settings/settings-tab';
import type { RecapRavenSettings } from '../../src/settings/settings';
import type { MockApp } from '../mocks/obsidian';

describe('RecapRavenSettingTab', () => {
  it('stores a SecretStorage reference rather than rendering the key value', async () => {
    const settings: RecapRavenSettings = {
      secretName: 'rr-export-key-reference',
      importFolder: 'Recap Raven',
      tags: ['recap-raven'],
      createCampaignIndex: true,
    };
    const updateSettings = vi.fn(async () => undefined);
    const host = {
      getPluginSettings: () => settings,
      updateSettings,
      testConnection: vi.fn(async () => ({ campaignName: 'The Glass Archive' })),
    };
    const tab = new RecapRavenSettingTab(
      {} as MockApp as unknown as App,
      host as unknown as Plugin & typeof host,
    );
    tab.display();

    const secret = tab.containerEl.querySelector<HTMLInputElement>('.secret-component');
    expect(secret?.value).toBe('rr-export-key-reference');
    expect(tab.containerEl.textContent).not.toContain('raven_obs_');
    const link = tab.containerEl.querySelector<HTMLAnchorElement>('a[href="https://recapraven.com/account/api-keys"]');
    expect(link?.rel).toBe('noopener noreferrer');

    if (secret === null) throw new Error('Missing SecretComponent');
    secret.value = 'new-reference';
    secret.dispatchEvent(new Event('input'));
    await Promise.resolve();
    expect(updateSettings).toHaveBeenCalledWith({ secretName: 'new-reference' });
  });
});
