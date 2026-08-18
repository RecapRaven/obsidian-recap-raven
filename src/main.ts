import {
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  TFolder,
  normalizePath,
  setIcon,
} from 'obsidian';
import type { Campaign, SessionSummary } from './api/contract';
import { assertUuid } from './api/contract';
import {
  RecapRavenClient,
  asSafeRecapRavenError,
} from './api/recap-raven-client';
import { obsidianRequestTransport } from './api/obsidian-transport';
import { SessionImportService } from './import/import-service';
import type {
  CreateOnlyVault,
  ImportBatchResult,
  ImportErrorClassification,
} from './import/import-service';
import {
  buildSessionIdentityIndex,
  sessionIdFromFrontmatter,
} from './import/session-identity';
import type { SessionIdentityIndex } from './import/session-identity';
import { RecapRavenSettingTab } from './settings/settings-tab';
import {
  normalizePluginData,
  serializePluginData,
} from './settings/plugin-data';
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
} from './settings/settings';
import type { RecapRavenSettings } from './settings/settings';
import {
  ImportProgressModal,
  ImportSummaryModal,
  chooseSessions,
  previewImport,
} from './ui/import-modals';
import type {
  ImportPlan,
  ImportSummary,
  PlannedImportItem,
} from './ui/types';
import {
  collisionSessionPath,
  campaignAlternateIndexPath,
  campaignIndexPath,
  campaignSessionsFolderPath,
  normalizeImportRoot,
  parentFolder,
  sessionNotePath,
} from './utils/paths';
import { buildCampaignIndexNote } from './utils/frontmatter';

const RECAP_ORIGIN = 'https://recapraven.com';

interface ImportContext {
  campaign: Campaign;
  summaries: readonly SessionSummary[];
  identities: SessionIdentityIndex;
  plan: ImportPlan;
}

export default class RecapRavenPlugin extends Plugin {
  private pluginSettings: RecapRavenSettings = DEFAULT_SETTINGS;
  private identities: SessionIdentityIndex = buildSessionIdentityIndex();
  private importing = false;
  private pendingSave: Promise<void> = Promise.resolve();

  async onload(): Promise<void> {
    const data = normalizePluginData(await this.loadData());
    this.pluginSettings = data.settings;
    this.identities = buildSessionIdentityIndex([], data.sessionIdentities);
    this.registerIdentityEvents();
    this.addSettingTab(new RecapRavenSettingTab(this.app, this));

    const ribbon = this.addRibbonIcon('download', 'Import session recaps', () => {
      void this.openImportSelection(false);
    });
    setIcon(ribbon, 'download');

    this.addCommand({
      id: 'import-session-recaps',
      name: 'Import session recaps',
      callback: () => void this.openImportSelection(false),
    });
    this.addCommand({
      id: 'import-all-new-recaps',
      name: 'Import all new recaps',
      callback: () => void this.openImportSelection(true),
    });
    this.addCommand({
      id: 'preview-new-recap-import',
      name: 'Preview new recap import',
      callback: () => void this.previewAllNew(),
    });
    this.addCommand({
      id: 'create-campaign-index',
      name: 'Create campaign index',
      callback: () => void this.createCampaignIndexManually(),
    });
    this.addCommand({
      id: 'open-current-recap',
      name: 'Open current imported recap',
      checkCallback: (checking) => {
        const id = this.currentSessionId();
        if (id === null) return false;
        if (!checking) {
          window.open(`${RECAP_ORIGIN}/recaps/${encodeURIComponent(id)}`, '_blank', 'noopener,noreferrer');
        }
        return true;
      },
    });
  }

  async updateSettings(patch: Partial<RecapRavenSettings>): Promise<void> {
    this.pluginSettings = normalizeSettings({ ...this.pluginSettings, ...patch });
    await this.persistPluginData();
  }

  getPluginSettings(): RecapRavenSettings {
    return this.pluginSettings;
  }

  async testConnection(): Promise<{ campaignName: string }> {
    const campaign = await this.client().connection();
    return { campaignName: campaign.name };
  }

  private client(): RecapRavenClient {
    return new RecapRavenClient(
      obsidianRequestTransport,
      () => this.secretValue(),
    );
  }

  private secretValue(): string | null {
    const name = this.pluginSettings.secretName.trim();
    return name === '' ? null : this.app.secretStorage.getSecret(name);
  }

  private async openImportSelection(selectAllNew: boolean): Promise<void> {
    if (!this.beginImport()) return;
    try {
      const context = await this.loadContext();
      const selection = await chooseSessions(this.app, context.plan, selectAllNew);
      if (selection.action === 'cancel') return;
      if (selection.action === 'preview') {
        const confirmed = await previewImport(this.app, context.plan, selection.sessionIds);
        if (!confirmed) return;
      }
      await this.executeImport(context, selection.sessionIds);
    } catch (error) {
      this.showSafeError(error);
    } finally {
      this.importing = false;
    }
  }

  private async previewAllNew(): Promise<void> {
    if (!this.beginImport()) return;
    try {
      const context = await this.loadContext();
      const ids = context.plan.items
        .filter((item) => item.state !== 'imported')
        .map((item) => item.sessionId);
      if (ids.length === 0) {
        new Notice('All available Recap Raven sessions are already imported.');
        return;
      }
      await previewImport(this.app, context.plan, ids, false);
    } catch (error) {
      this.showSafeError(error);
    } finally {
      this.importing = false;
    }
  }

  private async createCampaignIndexManually(): Promise<void> {
    if (!this.beginImport()) return;
    try {
      const campaign = await this.client().connection();
      await this.createCampaignIndex(campaign, true);
    } catch (error) {
      this.showSafeError(error);
    } finally {
      this.importing = false;
    }
  }

  private beginImport(): boolean {
    if (this.importing) {
      new Notice('A Recap Raven import is already running.');
      return false;
    }
    this.importing = true;
    return true;
  }

  private async loadContext(): Promise<ImportContext> {
    const client = this.client();
    const campaign = await client.connection();
    const summaries = await client.listAllSessions(campaign.id);
    const reconciled = this.reconcileKnownIdentities();
    const migrated = this.migrateCampaignIdentities(campaign);
    const changed = reconciled || migrated;
    if (changed) await this.persistPluginData();
    const plan = await this.buildPlan(campaign, summaries, this.identities);
    return { campaign, summaries, identities: this.identities, plan };
  }

  private async buildPlan(
    campaign: Campaign,
    summaries: readonly SessionSummary[],
    identities: SessionIdentityIndex,
  ): Promise<ImportPlan> {
    const items: PlannedImportItem[] = [];
    for (const summary of summaries) {
      const title = summary.title?.trim() || 'Untitled recap';
      const canonical = sessionNotePath(
        this.pluginSettings.importFolder,
        campaign.name,
        summary.recorded_at,
        summary.session_number,
        summary.title,
      );
      if (identities.has(summary.id)) {
        const existingPath = identities.paths(summary.id)[0];
        items.push({
          sessionId: summary.id,
          title,
          sessionNumber: summary.session_number,
          recordedAt: summary.recorded_at,
          destinationPath: canonical,
          ...(existingPath === undefined ? {} : { existingPath }),
          state: 'imported',
        });
        continue;
      }
      const occupied = this.app.vault.getAbstractFileByPath(normalizePath(canonical)) !== null;
      items.push({
        sessionId: summary.id,
        title,
        sessionNumber: summary.session_number,
        recordedAt: summary.recorded_at,
        destinationPath: occupied ? collisionSessionPath(canonical, summary.id) : canonical,
        state: occupied ? 'collision' : 'new',
      });
    }
    return { campaignId: campaign.id, campaignName: campaign.name, items };
  }

  private async executeImport(context: ImportContext, sessionIds: readonly string[]): Promise<void> {
    const summaries = sessionIds
      .map((id) => context.summaries.find((summary) => summary.id === id))
      .filter((summary): summary is SessionSummary => summary !== undefined);
    const progress = new ImportProgressModal(this.app);
    progress.open();
    const service = new SessionImportService(
      { getSession: (id) => this.client().getSession(id, context.campaign.id) },
      this.vaultAdapter(),
      context.identities,
    );
    let result: ImportBatchResult;
    try {
      result = await service.importSessions(context.campaign, summaries, {
        importRoot: this.pluginSettings.importFolder,
        tags: this.pluginSettings.tags,
        classifyError: classifyImportError,
        onProgress: ({ current, total, summary }) => progress.update({
          current,
          total,
          title: summary.title?.trim() || 'Untitled recap',
        }),
      });
    } finally {
      progress.close();
    }
    await this.persistPluginData();
    if (result.imported > 0) {
      await this.createCampaignIndex(context.campaign);
    }
    const summary = this.toUiSummary(context, result);
    new ImportSummaryModal(this.app, summary, (path) => this.openFile(path)).open();
  }

  private toUiSummary(context: ImportContext, batch: ImportBatchResult): ImportSummary {
    const imported: ImportSummary['imported'] = [];
    const skipped: ImportSummary['skipped'] = [];
    const failed: ImportSummary['failed'] = [];
    for (const item of batch.items) {
      const title = context.summaries.find((session) => session.id === item.sessionId)?.title?.trim()
        || 'Untitled recap';
      if (item.status === 'imported' && item.path) {
        imported.push({ sessionId: item.sessionId, title, path: item.path });
      } else if (item.status === 'failed') {
        failed.push({ sessionId: item.sessionId, title, message: item.reason ?? 'This recap could not be imported.' });
      } else {
        skipped.push({
          sessionId: item.sessionId,
          title,
          ...(item.path === undefined ? {} : { path: item.path }),
          reason: item.reason ?? 'Already imported.',
        });
      }
    }
    return { imported, skipped, failed, notAttempted: batch.remaining };
  }

  private vaultAdapter(): CreateOnlyVault {
    return {
      exists: async (path) => this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null,
      ensureFolder: async (folder) => this.ensureFolder(folder),
      createExclusive: async (path, content) => {
        const normalized = normalizePath(path);
        if (this.app.vault.getAbstractFileByPath(normalized) !== null) return false;
        try {
          await this.app.vault.create(normalized, content);
          return true;
        } catch (error) {
          if (this.app.vault.getAbstractFileByPath(normalized) !== null) return false;
          throw error;
        }
      },
    };
  }

  private async createCampaignIndex(campaign: Campaign, manual = false): Promise<void> {
    if (!manual && !this.pluginSettings.createCampaignIndex) return;
    const vault = this.vaultAdapter();
    const canonicalPath = campaignIndexPath(this.pluginSettings.importFolder, campaign.name);
    const sessionsFolder = campaignSessionsFolderPath(
      this.pluginSettings.importFolder,
      campaign.name,
    );
    const content = buildCampaignIndexNote(campaign, sessionsFolder);
    const canonicalExists = await vault.exists(canonicalPath);
    if (canonicalExists && !manual) return;
    if (canonicalExists && await this.indexMatches(canonicalPath, content)) {
      new Notice('The Recap Raven campaign index already exists and was not changed.');
      return;
    }
    const path = canonicalExists
      ? campaignAlternateIndexPath(this.pluginSettings.importFolder, campaign.name)
      : canonicalPath;
    if (await vault.exists(path)) {
      const matches = await this.indexMatches(path, content);
      new Notice(matches
        ? 'The Recap Raven campaign index already exists and was not changed.'
        : 'The alternate campaign index destination is occupied and was not changed.');
      return;
    }
    try {
      await vault.ensureFolder(parentFolder(path));
      const created = await vault.createExclusive(path, content);
      if (manual) {
        new Notice(created
          ? canonicalExists
            ? 'Recap Raven campaign index created alongside your existing index.'
            : 'Campaign index created.'
          : 'The Recap Raven campaign index already exists and was not changed.');
      }
    } catch {
      new Notice(manual
        ? 'The campaign index could not be created.'
        : 'Recaps were imported, but the campaign index could not be created.');
    }
  }

  private async indexMatches(path: string, expected: string): Promise<boolean> {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(file instanceof TFile)) return false;
    try {
      return await this.app.vault.read(file) === expected;
    } catch {
      return false;
    }
  }

  private async ensureFolder(folder: string): Promise<void> {
    const segments = normalizePath(folder).split('/');
    let current = '';
    for (const segment of segments) {
      current = current === '' ? segment : `${current}/${segment}`;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFile) throw new Error('A file blocks the recap destination folder.');
      if (!(existing instanceof TFolder)) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  private async openFile(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(file instanceof TFile)) {
      new Notice('The imported recap could not be opened.');
      return;
    }
    await this.app.workspace.getLeaf(false).openFile(file);
  }

  private currentSessionId(): string | null {
    const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
    if (file === null || file === undefined) return null;
    const frontmatter: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (frontmatter === null || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) return null;
    const value = (frontmatter as Record<string, unknown>).recap_raven_session_id;
    if (typeof value !== 'string') return null;
    try {
      assertUuid(value, 'session id');
      return value;
    } catch {
      return null;
    }
  }

  private registerIdentityEvents(): void {
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      const changed = file instanceof TFolder
        ? this.identities.renamePathsUnder(oldPath, file.path)
        : this.identities.renamePath(oldPath, file.path);
      if (changed) this.persistIdentityEvent();
    }));
    this.registerEvent(this.app.vault.on('delete', (file) => {
      const changed = file instanceof TFolder
        ? this.identities.removePathsUnder(file.path)
        : this.identities.removePath(file.path);
      if (changed) this.persistIdentityEvent();
    }));
    this.registerEvent(this.app.metadataCache.on('changed', (file, _data, cache) => {
      if (!this.identities.hasPath(file.path) && !this.isManagedImportPath(file.path)) return;
      const sessionId = sessionIdFromFrontmatter(cache.frontmatter);
      const changed = sessionId === null
        ? this.identities.removePath(file.path)
        : this.identities.add(sessionId, file.path);
      if (changed) this.persistIdentityEvent();
    }));
  }

  private reconcileKnownIdentities(): boolean {
    let changed = false;
    for (const identity of this.identities.entries()) {
      const file = this.app.vault.getAbstractFileByPath(normalizePath(identity.path));
      if (!(file instanceof TFile)) {
        changed = this.identities.removePath(identity.path) || changed;
        continue;
      }
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache === null) continue;
      const actualId = sessionIdFromFrontmatter(cache.frontmatter);
      if (actualId !== identity.sessionId) {
        changed = this.identities.removePath(identity.path) || changed;
        if (actualId !== null) changed = this.identities.add(actualId, identity.path) || changed;
      }
    }
    return changed;
  }

  /** One-time-compatible discovery is deliberately limited to this campaign's managed sessions folder. */
  private migrateCampaignIdentities(campaign: Campaign): boolean {
    const folderPath = campaignSessionsFolderPath(this.pluginSettings.importFolder, campaign.name);
    const folder = this.app.vault.getAbstractFileByPath(normalizePath(folderPath));
    if (!(folder instanceof TFolder)) return false;
    const pending = [...folder.children];
    let changed = false;
    while (pending.length > 0) {
      const item = pending.pop();
      if (item instanceof TFolder) {
        pending.push(...item.children);
      } else if (item instanceof TFile) {
        const sessionId = sessionIdFromFrontmatter(this.app.metadataCache.getFileCache(item)?.frontmatter);
        if (sessionId !== null) changed = this.identities.add(sessionId, item.path) || changed;
      }
    }
    return changed;
  }

  private isManagedImportPath(path: string): boolean {
    try {
      const root = normalizeImportRoot(this.pluginSettings.importFolder);
      return path === root || path.startsWith(`${root}/`);
    } catch {
      return false;
    }
  }

  private persistIdentityEvent(): void {
    void this.persistPluginData().catch(() => {
      new Notice('Recap Raven could not save its import index. Your notes were not changed.', 8000);
    });
  }

  private persistPluginData(): Promise<void> {
    const save = async (): Promise<void> => {
      await this.saveData(serializePluginData({
        settings: this.pluginSettings,
        sessionIdentities: this.identities.entries(),
      }));
    };
    this.pendingSave = this.pendingSave.catch(() => undefined).then(save);
    return this.pendingSave;
  }

  private showSafeError(error: unknown): void {
    const safe = asSafeRecapRavenError(error);
    const message = safe.code === 'unauthorized'
      ? `${safe.message} Open Obsidian Settings → Recap Raven to select a new key.`
      : safe.message;
    new Notice(message, 8000);
  }
}

function classifyImportError(error: unknown): ImportErrorClassification {
  const safe = asSafeRecapRavenError(error);
  return {
    message: safe.message,
    fatal: safe.code === 'missing-key'
      || safe.code === 'invalid-key'
      || safe.code === 'unauthorized'
      || safe.code === 'forbidden'
      || safe.code === 'rate-limited'
      || safe.code === 'unavailable',
  };
}
