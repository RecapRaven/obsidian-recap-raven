import { Setting } from 'obsidian';
import type { App, Plugin, SettingDefinitionItem, SettingGroup } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { RecapRavenSettingTab } from '../../src/settings/settings-tab';
import type { RecapRavenSettings } from '../../src/settings/settings';
import type { MockApp } from '../mocks/obsidian';

describe('RecapRavenSettingTab', () => {
  it('exposes searchable declarative definitions while retaining custom secret storage', async () => {
    let settings: RecapRavenSettings = {
      secretName: 'rr-export-key-reference',
      importFolder: 'Recap Raven',
      tags: ['recap-raven'],
      createCampaignIndex: true,
      includeTranscripts: false,
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
    const update = vi.fn();
    Object.assign(tab, { update });

    const definitions = tab.getSettingDefinitions();
    expect(definitions.map(definitionName)).toEqual([
      'Recap Raven export API key',
      'Connection',
      'Import folder',
      'Tags',
      'Include session transcripts',
      'Create campaign index',
    ]);
    expect(control(definitions, 'Import folder')).toMatchObject({
      type: 'text',
      key: 'importFolder',
    });
    expect(control(definitions, 'Tags')).toMatchObject({ type: 'text', key: 'tags' });
    expect(control(definitions, 'Include session transcripts')).toMatchObject({ type: 'toggle', key: 'includeTranscripts' });
    expect(control(definitions, 'Create campaign index')).toMatchObject({
      type: 'toggle',
      key: 'createCampaignIndex',
    });

    const keyContainer = document.body.createDiv();
    renderDefinition(definitions, 'Recap Raven export API key', new Setting(keyContainer));
    const secret = keyContainer.querySelector<HTMLInputElement>('.secret-component');
    expect(secret?.value).toBe('rr-export-key-reference');
    expect(secret?.value).not.toContain('raven_obs_');
    if (secret === null) throw new Error('Missing declarative SecretComponent');
    secret.value = 'recap-raven-api-key';
    secret.dispatchEvent(new Event('input'));
    await Promise.resolve();
    await Promise.resolve();

    expect(updateSettings).toHaveBeenCalledWith({ secretName: 'recap-raven-api-key' });
    expect(update).toHaveBeenCalledOnce();

    const connectionContainer = document.body.createDiv();
    renderDefinition(tab.getSettingDefinitions(), 'Connection', new Setting(connectionContainer));
    const connectionButton = button(connectionContainer, 'Test connection');
    expect(connectionButton.disabled).toBe(false);
    connectionButton.click();
    await vi.waitFor(() => {
      expect(host.testConnection).toHaveBeenCalledOnce();
      expect(update).toHaveBeenCalledTimes(3);
    });
    const connection = tab.getSettingDefinitions()
      .find((definition) => 'name' in definition && definition.name === 'Connection');
    expect(connection).toMatchObject({ desc: 'Connected to The Glass Archive' });
  });

  it('normalizes declarative values through immutable settings updates', async () => {
    const settings: RecapRavenSettings = {
      secretName: 'rr-export-key-reference',
      importFolder: 'Recap Raven',
      tags: ['recap-raven', 'session-recap'],
      createCampaignIndex: true,
      includeTranscripts: false,
    };
    const host = {
      getPluginSettings: () => settings,
      updateSettings: vi.fn(async () => undefined),
      testConnection: vi.fn(async () => ({ campaignName: 'The Glass Archive' })),
    };
    const tab = new RecapRavenSettingTab(
      {} as MockApp as unknown as App,
      host as unknown as Plugin & typeof host,
    );

    expect(tab.getControlValue('importFolder')).toBe('Recap Raven');
    expect(tab.getControlValue('tags')).toBe('recap-raven, session-recap');
    expect(tab.getControlValue('createCampaignIndex')).toBe(true);
    expect(tab.getControlValue('includeTranscripts')).toBe(false);

    await tab.setControlValue('importFolder', ' Campaigns\\Recaps ');
    await tab.setControlValue('tags', ' #recap-raven, session-recap, , #icewind ');
    await tab.setControlValue('createCampaignIndex', false);

    expect(host.updateSettings).toHaveBeenNthCalledWith(1, { importFolder: 'Campaigns/Recaps' });
    expect(host.updateSettings).toHaveBeenNthCalledWith(2, {
      tags: ['recap-raven', 'session-recap', 'icewind'],
    });
    expect(host.updateSettings).toHaveBeenNthCalledWith(3, { createCampaignIndex: false });
    await tab.setControlValue('includeTranscripts', true);
    expect(host.updateSettings).toHaveBeenNthCalledWith(4, { includeTranscripts: true });
    await expect(tab.setControlValue('unknown', 'value')).rejects.toThrow('Unsupported setting control');
  });

  it('stores a SecretStorage reference rather than rendering the key value', async () => {
    let settings: RecapRavenSettings = {
      secretName: 'rr-export-key-reference',
      importFolder: 'Recap Raven',
      tags: ['recap-raven'],
      createCampaignIndex: true,
      includeTranscripts: false,
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
    renderLegacy(tab);

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
      includeTranscripts: false,
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
    renderLegacy(tab);

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

function control(
  definitions: SettingDefinitionItem[],
  name: string,
): Record<string, unknown> {
  const definition = definitions.find((candidate) => 'name' in candidate && candidate.name === name);
  if (definition === undefined || !('control' in definition) || definition.control === undefined) {
    throw new Error(`Missing declarative control ${name}`);
  }
  return definition.control as unknown as Record<string, unknown>;
}

function definitionName(definition: SettingDefinitionItem): string {
  if (!('name' in definition)) throw new Error('Unexpected unnamed setting definition');
  return definition.name;
}

function renderDefinition(
  definitions: SettingDefinitionItem[],
  name: string,
  setting: Setting,
): void {
  const definition = definitions.find((candidate) => 'name' in candidate && candidate.name === name);
  if (definition === undefined || !('render' in definition) || definition.render === undefined) {
    throw new Error(`Missing declarative renderer ${name}`);
  }
  definition.render(setting, undefined as unknown as SettingGroup);
}

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')]
    .find((candidate) => candidate.textContent === name);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`Missing button ${name}`);
  return found;
}

function renderLegacy(tab: RecapRavenSettingTab): void {
  const legacyTab = tab as unknown as { display: () => void };
  legacyTab.display();
}
