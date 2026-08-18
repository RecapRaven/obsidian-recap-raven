import { PluginSettingTab, SecretComponent, Setting, normalizePath } from 'obsidian';
import type { App, Plugin, SettingDefinitionItem } from 'obsidian';
import type { RecapRavenSettings } from './settings';

const API_KEYS_URL = 'https://recapraven.com/account/api-keys';

export interface SettingsHost {
  getPluginSettings(): RecapRavenSettings;
  updateSettings(patch: Partial<RecapRavenSettings>): Promise<void>;
  testConnection(): Promise<{ campaignName: string }>;
}

export class RecapRavenSettingTab extends PluginSettingTab {
  private connectionMessage = 'Not checked';
  private testingConnection = false;

  constructor(app: App, private readonly host: Plugin & SettingsHost) {
    super(app, host);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: 'Recap Raven export API key',
        desc: this.apiKeyDescription(),
        render: (setting) => {
          this.addSecretControl(setting, () => this.refreshDeclarativeSettings());
        },
      },
      {
        name: 'Connection',
        desc: this.connectionMessage,
        render: (setting) => {
          this.addConnectionButton(setting, () => this.refreshDeclarativeSettings());
        },
      },
      {
        name: 'Import folder',
        desc: 'Recaps are created inside a campaign folder. Existing notes are never overwritten.',
        control: {
          type: 'text',
          key: 'importFolder',
          placeholder: 'Recap Raven',
        },
      },
      {
        name: 'Tags',
        desc: 'Comma-separated tags added to imported recap properties.',
        control: {
          type: 'text',
          key: 'tags',
          placeholder: 'recap-raven, session-recap',
        },
      },
      {
        name: 'Create campaign index',
        desc: 'Create a campaign index when one does not already exist. Existing indexes are never changed.',
        control: {
          type: 'toggle',
          key: 'createCampaignIndex',
        },
      },
    ];
  }

  getControlValue(key: string): unknown {
    const settings = this.host.getPluginSettings();
    if (key === 'tags') return settings.tags.join(', ');
    if (key === 'importFolder') return settings.importFolder;
    if (key === 'createCampaignIndex') return settings.createCampaignIndex;
    return undefined;
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === 'importFolder' && typeof value === 'string') {
      await this.host.updateSettings({ importFolder: this.normalizeImportFolder(value) });
      return;
    }
    if (key === 'tags' && typeof value === 'string') {
      await this.host.updateSettings({ tags: this.parseTags(value) });
      return;
    }
    if (key === 'createCampaignIndex' && typeof value === 'boolean') {
      await this.host.updateSettings({ createCampaignIndex: value });
      return;
    }
    throw new TypeError(`Unsupported setting control: ${key}`);
  }

  display(): void {
    this.renderLegacySettings();
  }

  private renderLegacySettings(): void {
    const { containerEl } = this;
    containerEl.empty();

    const apiKeySetting = new Setting(containerEl)
      .setName('Recap Raven export API key')
      .setDesc(this.apiKeyDescription());
    this.addSecretControl(apiKeySetting, () => this.renderLegacySettings());

    const connectionSetting = new Setting(containerEl)
      .setName('Connection')
      .setDesc(this.connectionMessage);
    this.addConnectionButton(connectionSetting, () => this.renderLegacySettings());

    new Setting(containerEl)
      .setName('Import folder')
      .setDesc('Recaps are created inside a campaign folder. Existing notes are never overwritten.')
      .addText((text) => {
        text
          .setPlaceholder('Recap Raven')
          .setValue(this.host.getPluginSettings().importFolder)
          .onChange(async (value) => {
            await this.host.updateSettings({ importFolder: this.normalizeImportFolder(value) });
          });
      });

    new Setting(containerEl)
      .setName('Tags')
      .setDesc('Comma-separated tags added to imported recap properties.')
      .addText((text) => {
        text
          .setPlaceholder('recap-raven, session-recap')
          .setValue(this.host.getPluginSettings().tags.join(', '))
          .onChange(async (value) => {
            await this.host.updateSettings({ tags: this.parseTags(value) });
          });
      });

    new Setting(containerEl)
      .setName('Create campaign index')
      .setDesc('Create a campaign index when one does not already exist. Existing indexes are never changed.')
      .addToggle((toggle) => {
        toggle
          .setValue(this.host.getPluginSettings().createCampaignIndex)
          .onChange(async (value) => {
            await this.host.updateSettings({ createCampaignIndex: value });
          });
      });
  }

  private refreshDeclarativeSettings(): void {
    const declarativeTab = this as unknown as { update: () => void };
    declarativeTab.update();
  }

  private addSecretControl(setting: Setting, refresh: () => void): void {
    setting.addComponent((element) => {
      return new SecretComponent(this.app, element)
        .setValue(this.host.getPluginSettings().secretName)
        .onChange(async (value) => {
          this.connectionMessage = 'Not checked';
          await this.host.updateSettings({ secretName: value });
          refresh();
        });
    });
  }

  private addConnectionButton(setting: Setting, refresh: () => void): void {
    setting.addButton((button) => {
      button
        .setButtonText(this.testingConnection ? 'Testing…' : 'Test connection')
        .setDisabled(this.testingConnection || this.host.getPluginSettings().secretName.trim() === '')
        .onClick(async () => {
          this.testingConnection = true;
          this.connectionMessage = 'Checking…';
          refresh();
          try {
            const connection = await this.host.testConnection();
            this.connectionMessage = `Connected to ${connection.campaignName}`;
          } catch (error) {
            this.connectionMessage = error instanceof Error
              ? error.message
              : 'Could not connect to Recap Raven.';
          } finally {
            this.testingConnection = false;
            refresh();
          }
        });
    });
  }

  private normalizeImportFolder(value: string): string {
    return normalizePath(value.trim() || 'Recap Raven');
  }

  private parseTags(value: string): string[] {
    return value
      .split(',')
      .map((tag) => tag.trim().replace(/^#+/, ''))
      .filter((tag) => tag !== '');
  }

  private apiKeyDescription(): DocumentFragment {
    const fragment = createFragment();
    fragment.append(
      'Select an Obsidian secret containing your campaign-bound Recap Raven export API key. '
        + 'When creating the secret, use a lowercase ID such as recap-raven-api-key, then paste '
        + 'the raven_obs_… key as its value. The key value is not saved in this plugin’s settings. ',
    );
    const link = fragment.createEl('a', { text: 'Create an export key', href: API_KEYS_URL });
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    return fragment;
  }
}
