import type { App, Plugin } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { RecapRavenSettingTab } from '../../src/settings/settings-tab';
import type { RecapRavenSettings } from '../../src/settings/settings';
import type { MockApp } from '../mocks/obsidian';

describe('RecapRavenSettingTab', () => {
  it('stores a SecretStorage reference rather than rendering the key value', async () => {
    let settings: RecapRavenSettings = {
      secretName: 'rr-export-key-reference',
      importFolder: 'Recap Raven',
      tags: ['recap-raven'],
      createCampaignIndex: true,
    };
    const updateSettings = vi.fn(async (patch: Partial<RecapRavenSettings>) => {
      settings = { ...settings, ...patch };
    });
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

    expect(tab.containerEl.textContent).toContain('Recap Raven export API key');
    expect(tab.containerEl.textContent).toContain('recap-raven-api-key');
    expect(button(tab.containerEl, 'Test connection').disabled).toBe(false);

    const secret = tab.containerEl.querySelector<HTMLInputElement>('.secret-component');
    expect(secret?.value).toBe('rr-export-key-reference');
    expect(secret?.value).not.toContain('raven_obs_');
    const link = tab.containerEl.querySelector<HTMLAnchorElement>('a[href="https://recapraven.com/account/api-keys"]');
    expect(link?.rel).toBe('noopener noreferrer');

    if (secret === null) throw new Error('Missing SecretComponent');
    secret.value = 'new-reference';
    secret.dispatchEvent(new Event('input'));
    await Promise.resolve();
    await Promise.resolve();
    expect(updateSettings).toHaveBeenCalledWith({ secretName: 'new-reference' });
    expect(button(tab.containerEl, 'Test connection').disabled).toBe(false);
  });

  it('enables connection testing immediately after a secret is selected', async () => {
    let settings: RecapRavenSettings = {
      secretName: '',
      importFolder: 'Recap Raven',
      tags: ['recap-raven'],
      createCampaignIndex: true,
    };
    const host = {
      getPluginSettings: () => settings,
      updateSettings: vi.fn(async (patch: Partial<RecapRavenSettings>) => {
        settings = { ...settings, ...patch };
      }),
      testConnection: vi.fn(async () => ({ campaignName: 'The Glass Archive' })),
    };
    const tab = new RecapRavenSettingTab(
      {} as MockApp as unknown as App,
      host as unknown as Plugin & typeof host,
    );
    tab.display();

    expect(button(tab.containerEl, 'Test connection').disabled).toBe(true);
    const secret = tab.containerEl.querySelector<HTMLInputElement>('.secret-component');
    if (secret === null) throw new Error('Missing SecretComponent');
    secret.value = 'recap-raven-api-key';
    secret.dispatchEvent(new Event('input'));
    await Promise.resolve();
    await Promise.resolve();

    expect(host.updateSettings).toHaveBeenCalledWith({ secretName: 'recap-raven-api-key' });
    expect(button(tab.containerEl, 'Test connection').disabled).toBe(false);
  });
});

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')]
    .find((candidate) => candidate.textContent === name);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`Missing button ${name}`);
  return found;
}
