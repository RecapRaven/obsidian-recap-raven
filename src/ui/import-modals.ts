import { Modal, Setting, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import type {
  ImportPlan,
  ImportProgress,
  ImportSummary,
  PlannedImportItem,
  SelectionResult,
} from './types';

function sessionLabel(item: PlannedImportItem): string {
  return item.sessionNumber === null
    ? item.title
    : `Session ${item.sessionNumber}: ${item.title}`;
}

function renderSessionTitle(container: HTMLElement, item: PlannedImportItem): void {
  if (item.sessionNumber === null) {
    container.setText(item.title);
    return;
  }
  container.createEl('strong', { text: `Session ${item.sessionNumber}:` });
  container.append(` ${item.title}`);
}

function dateLabel(value: string | null): string {
  if (value === null) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Date unavailable' : date.toLocaleDateString();
}

function stateLabel(item: PlannedImportItem): string {
  if (item.state === 'imported') return `Already imported${item.existingPath ? `: ${item.existingPath}` : ''}`;
  return 'New';
}

function renderCollisionWarning(container: HTMLElement): void {
  const warning = container.createDiv({ cls: 'recap-raven-session-warning' });
  const icon = warning.createSpan({ cls: 'recap-raven-session-warning-icon' });
  setIcon(icon, 'triangle-alert');
  warning.createSpan({ text: 'Destination occupied — an alternate filename will be created.' });
}

export class ImportSelectionModal extends Modal {
  private readonly selected = new Set<string>();
  private query = '';
  private settled = false;

  constructor(
    app: App,
    private readonly plan: ImportPlan,
    private readonly resolveResult: (result: SelectionResult) => void,
    initiallySelectAllNew = false,
  ) {
    super(app);
    if (initiallySelectAllNew) {
      for (const item of plan.items) {
        if (item.state !== 'imported') this.selected.add(item.sessionId);
      }
    }
  }

  onOpen(): void {
    this.modalEl.addClass('recap-raven-modal');
    this.setTitle('Import session recaps');
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolveResult({ action: 'cancel' });
    }
  }

  private finish(result: SelectionResult): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveResult(result);
    this.close();
  }

  private visibleItems(): PlannedImportItem[] {
    const normalized = this.query.trim().toLocaleLowerCase();
    const items = [...this.plan.items].sort((left, right) => {
      const leftDate = left.recordedAt ?? '';
      const rightDate = right.recordedAt ?? '';
      const dateComparison = rightDate.localeCompare(leftDate);
      if (dateComparison !== 0) return dateComparison;
      return (right.sessionNumber ?? -1) - (left.sessionNumber ?? -1);
    });
    if (!normalized) return items;
    return items.filter((item) => {
      const haystack = `${item.title} ${item.sessionNumber ?? ''} ${item.recordedAt ?? ''}`.toLocaleLowerCase();
      return haystack.includes(normalized);
    });
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('p', {
      cls: 'recap-raven-campaign',
      text: `Campaign: ${this.plan.campaignName}`,
    });

    new Setting(contentEl)
      .setName('Search sessions')
      .addSearch((search) => {
        search.inputEl.addClass('recap-raven-search');
        search
          .setPlaceholder('Title, session number, or date')
          .setValue(this.query)
          .onChange((value) => {
            this.query = value;
            this.render();
            window.setTimeout(() => {
              const input = this.contentEl.querySelector<HTMLInputElement>('.recap-raven-search');
              input?.focus();
              input?.setSelectionRange(value.length, value.length);
            }, 0);
          });
      });

    const actions = contentEl.createDiv({ cls: 'recap-raven-inline-actions' });
    const selectAll = actions.createEl('button', { text: 'Select all new' });
    selectAll.addEventListener('click', () => {
      for (const item of this.plan.items) {
        if (item.state !== 'imported') this.selected.add(item.sessionId);
      }
      this.render();
    });
    const clear = actions.createEl('button', { text: 'Clear' });
    clear.addEventListener('click', () => {
      this.selected.clear();
      this.render();
    });

    const list = contentEl.createDiv({ cls: 'recap-raven-session-list' });
    const visible = this.visibleItems();
    if (visible.length === 0) {
      list.createEl('p', { cls: 'recap-raven-empty', text: 'No sessions match your search.' });
    }
    for (const item of visible) {
      const row = list.createEl('label', { cls: 'recap-raven-session-row' });
      const checkbox = row.createEl('input', { type: 'checkbox' });
      checkbox.checked = this.selected.has(item.sessionId);
      checkbox.disabled = item.state === 'imported';
      checkbox.setAttribute('aria-label', `Select ${sessionLabel(item)}`);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) this.selected.add(item.sessionId);
        else this.selected.delete(item.sessionId);
        this.renderFooter();
      });
      const text = row.createDiv({ cls: 'recap-raven-session-row-text' });
      const title = text.createDiv({ cls: 'recap-raven-session-title' });
      renderSessionTitle(title, item);
      text.createDiv({
        cls: 'recap-raven-session-meta',
        text: item.state === 'collision'
          ? dateLabel(item.recordedAt)
          : `${dateLabel(item.recordedAt)} · ${stateLabel(item)}`,
      });
      if (item.state === 'collision') renderCollisionWarning(text);
    }

    this.renderFooter();
  }

  private renderFooter(): void {
    this.contentEl.querySelector('.recap-raven-modal-footer')?.remove();
    const footer = this.contentEl.createDiv({ cls: 'recap-raven-modal-footer' });
    footer.createSpan({ text: `${this.selected.size} selected` });
    const buttons = footer.createDiv({ cls: 'recap-raven-inline-actions' });
    const cancel = buttons.createEl('button', { text: 'Cancel' });
    cancel.addEventListener('click', () => this.finish({ action: 'cancel' }));
    const preview = buttons.createEl('button', { text: 'Preview plan' });
    preview.disabled = this.selected.size === 0;
    preview.addEventListener('click', () => {
      this.finish({ action: 'preview', sessionIds: [...this.selected] });
    });
    const importButton = buttons.createEl('button', { cls: 'mod-cta', text: 'Import selected' });
    importButton.disabled = this.selected.size === 0;
    importButton.addEventListener('click', () => {
      this.finish({ action: 'import', sessionIds: [...this.selected] });
    });
  }
}

export class ImportPreviewModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly plan: ImportPlan,
    private readonly sessionIds: Set<string>,
    private readonly resolveImport: (shouldImport: boolean) => void,
    private readonly allowImport: boolean,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass('recap-raven-modal');
    this.setTitle('Preview import');
    const selected = this.plan.items.filter((item) => this.sessionIds.has(item.sessionId));
    const newCount = selected.filter((item) => item.state !== 'imported').length;
    const skippedCount = selected.length - newCount;
    this.contentEl.createEl('p', {
      text: `${this.plan.campaignName}: ${newCount} note${newCount === 1 ? '' : 's'} to create, ${skippedCount} to skip. No notes have been changed.`,
    });
    const list = this.contentEl.createEl('ul', { cls: 'recap-raven-plan-list' });
    for (const item of selected) {
      const entry = list.createEl('li');
      const title = entry.createDiv({ cls: 'recap-raven-plan-session' });
      renderSessionTitle(title, item);
      const action = entry.createDiv({ cls: 'recap-raven-plan-action' });
      action.createEl('strong', { text: item.state === 'imported' ? 'Skip' : 'Create' });
      action.append(item.state === 'imported'
        ? ` ${item.existingPath ?? 'already imported'}`
        : ` ${item.destinationPath}`);
      if (item.state === 'collision') renderCollisionWarning(entry);
    }
    const footer = this.contentEl.createDiv({ cls: 'recap-raven-modal-footer' });
    const buttons = footer.createDiv({ cls: 'recap-raven-inline-actions' });
    const cancel = buttons.createEl('button', { text: 'Cancel' });
    cancel.addEventListener('click', () => this.finish(false));
    if (this.allowImport) {
      const importButton = buttons.createEl('button', { cls: 'mod-cta', text: 'Import' });
      importButton.disabled = newCount === 0;
      importButton.addEventListener('click', () => this.finish(true));
    } else {
      cancel.setText('Close');
      cancel.addClass('mod-cta');
    }
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolveImport(false);
    }
  }

  private finish(shouldImport: boolean): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveImport(shouldImport);
    this.close();
  }
}

export class ImportProgressModal extends Modal {
  private textEl: HTMLElement | null = null;

  onOpen(): void {
    this.modalEl.addClass('recap-raven-modal');
    this.setTitle('Importing recaps');
    this.textEl = this.contentEl.createEl('p', { text: 'Preparing import…' });
  }

  update(progress: ImportProgress): void {
    this.textEl?.setText(`Importing ${progress.current} of ${progress.total}: ${progress.title}`);
  }
}

export class ImportSummaryModal extends Modal {
  constructor(
    app: App,
    private readonly summary: ImportSummary,
    private readonly openFile: (path: string) => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass('recap-raven-modal');
    this.setTitle('Import complete');
    this.contentEl.createEl('p', {
      text: `${this.summary.imported.length} imported, ${this.summary.skipped.length} skipped, ${this.summary.failed.length} failed, ${this.summary.notAttempted} not attempted.`,
    });
    if (this.summary.notAttempted > 0) {
      this.contentEl.createEl('p', {
        text: `${this.summary.notAttempted} selected ${this.summary.notAttempted === 1 ? 'recap was' : 'recaps were'} not attempted because the import stopped early.`,
      });
    }
    this.renderSection('Imported', this.summary.imported.map((item) => `${item.title} — ${item.path}`));
    this.renderSection('Skipped', this.summary.skipped.map((item) => `${item.title} — ${item.reason}${item.path ? ` (${item.path})` : ''}`));
    this.renderSection('Failed', this.summary.failed.map((item) => `${item.title} — ${item.message}`));

    const footer = this.contentEl.createDiv({ cls: 'recap-raven-modal-footer' });
    const buttons = footer.createDiv({ cls: 'recap-raven-inline-actions' });
    if (this.summary.imported[0]) {
      const firstPath = this.summary.imported[0].path;
      const open = buttons.createEl('button', { text: 'Open first imported note' });
      open.addEventListener('click', () => {
        void this.openFile(firstPath).then(() => this.close());
      });
    }
    const close = buttons.createEl('button', { cls: 'mod-cta', text: 'Close' });
    close.addEventListener('click', () => this.close());
  }

  private renderSection(title: string, entries: string[]): void {
    if (entries.length === 0) return;
    new Setting(this.contentEl).setName(title).setHeading();
    const list = this.contentEl.createEl('ul', { cls: 'recap-raven-summary-list' });
    for (const entry of entries) list.createEl('li', { text: entry });
  }
}

export function chooseSessions(app: App, plan: ImportPlan, selectAllNew: boolean): Promise<SelectionResult> {
  return new Promise((resolve) => new ImportSelectionModal(app, plan, resolve, selectAllNew).open());
}

export function previewImport(
  app: App,
  plan: ImportPlan,
  sessionIds: string[],
  allowImport = true,
): Promise<boolean> {
  return new Promise((resolve) => {
    new ImportPreviewModal(app, plan, new Set(sessionIds), resolve, allowImport).open();
  });
}
