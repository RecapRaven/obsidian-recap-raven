import { PluginSettingTab, SecretComponent, Setting, normalizePath } from 'obsidian';
import type { App, Plugin } from 'obsidian';
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

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Recap Raven export API key')
      .setDesc(this.apiKeyDescription())
      .addComponent((element) => {
        return new SecretComponent(this.app, element)
          .setValue(this.host.getPluginSettings().secretName)
          .onChange(async (value) => {
            this.connectionMessage = 'Not checked';
            await this.host.updateSettings({ secretName: value });
            this.display();
          });
      });

    new Setting(containerEl)
      .setName('Connection')
      .setDesc(this.connectionMessage)
      .addButton((button) => {
        button
          .setButtonText(this.testingConnection ? 'Testing…' : 'Test connection')
          .setDisabled(this.testingConnection || this.host.getPluginSettings().secretName.trim() === '')
          .onClick(async () => {
            this.testingConnection = true;
            this.connectionMessage = 'Checking…';
            this.display();
            try {
              const connection = await this.host.testConnection();
              this.connectionMessage = `Connected to ${connection.campaignName}`;
            } catch (error) {
              this.connectionMessage = error instanceof Error
                ? error.message
                : 'Could not connect to Recap Raven.';
            } finally {
              this.testingConnection = false;
              this.display();
            }
          });
      });

    new Setting(containerEl)
      .setName('Import folder')
      .setDesc('Recaps are created inside a campaign folder. Existing notes are never overwritten.')
      .addText((text) => {
        text
          .setPlaceholder('Recap Raven')
          .setValue(this.host.getPluginSettings().importFolder)
          .onChange(async (value) => {
            await this.host.updateSettings({
              importFolder: normalizePath(value.trim() || 'Recap Raven'),
            });
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
            const tags = value
              .split(',')
              .map((tag) => tag.trim().replace(/^#+/, ''))
              .filter((tag) => tag !== '');
            await this.host.updateSettings({ tags });
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
