import { vi } from 'vitest';

export interface MockCommand {
  id: string;
  name: string;
  callback?: () => void;
  checkCallback?: (checking: boolean) => boolean;
}

export const notices: Array<{ message: string; timeout?: number }> = [];
export const openModals: Modal[] = [];
export const requestUrl = vi.fn<
  (request: Readonly<Record<string, unknown>>) => Promise<{ status: number; json: unknown }>
>();

export function resetObsidianMock(): void {
  notices.length = 0;
  openModals.splice(0).forEach((modal) => modal.close());
  requestUrl.mockReset();
}

export class TFolder {
  public readonly children: Array<TFile | TFolder> = [];

  constructor(public path: string) {}
}

export class TFile {
  public readonly basename: string;

  constructor(public path: string, public readonly content = '') {
    const filename = path.split('/').at(-1) ?? path;
    this.basename = filename.replace(/\.md$/iu, '');
  }
}

export class MarkdownView {
  constructor(public readonly file: TFile | null) {}
}

export class Notice {
  constructor(message: string, timeout?: number) {
    notices.push(timeout === undefined ? { message } : { message, timeout });
  }
}

export class Plugin {
  public readonly commands: MockCommand[] = [];
  public readonly settingTabs: PluginSettingTab[] = [];
  public readonly ribbons: Array<{ icon: string; title: string; callback: () => void }> = [];
  public data: unknown = null;

  constructor(public readonly app: MockApp) {}

  async loadData(): Promise<unknown> {
    return this.data;
  }

  async saveData(value: unknown): Promise<void> {
    this.data = value;
  }

  addCommand(command: MockCommand): MockCommand {
    this.commands.push(command);
    return command;
  }

  addRibbonIcon(icon: string, title: string, callback: () => void): HTMLElement {
    this.ribbons.push({ icon, title, callback });
    const element = document.createElement('button');
    element.setAttribute('aria-label', title);
    element.addEventListener('click', callback);
    document.body.append(element);
    return element;
  }

  addSettingTab(tab: PluginSettingTab): void {
    this.settingTabs.push(tab);
  }

  registerEvent(_eventRef: unknown): void {}
}

export class PluginSettingTab {
  public readonly containerEl = document.createElement('div');

  constructor(public readonly app: MockApp, public readonly plugin: Plugin) {}

  display(): void {}
}

export class Modal {
  public readonly modalEl = document.createElement('div');
  public readonly titleEl = document.createElement('h2');
  public readonly contentEl = document.createElement('div');
  private opened = false;

  constructor(public readonly app: MockApp) {
    this.modalEl.setAttribute('role', 'dialog');
    this.modalEl.setAttribute('aria-modal', 'true');
    this.modalEl.append(this.titleEl, this.contentEl);
  }

  setTitle(title: string): this {
    this.titleEl.textContent = title;
    this.modalEl.setAttribute('aria-label', title);
    return this;
  }

  open(): void {
    this.opened = true;
    document.body.append(this.modalEl);
    openModals.push(this);
    this.onOpen();
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.onClose();
    this.modalEl.remove();
    const index = openModals.indexOf(this);
    if (index >= 0) openModals.splice(index, 1);
  }

  onOpen(): void {}
  onClose(): void {}
}

export class Setting {
  public readonly settingEl: HTMLDivElement;
  public readonly nameEl: HTMLDivElement;
  public readonly descEl: HTMLDivElement;
  public readonly controlEl: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.settingEl = container.createDiv({ cls: 'setting-item' });
    this.nameEl = this.settingEl.createDiv({ cls: 'setting-item-name' });
    this.descEl = this.settingEl.createDiv({ cls: 'setting-item-description' });
    this.controlEl = this.settingEl.createDiv({ cls: 'setting-item-control' });
  }

  setName(name: string): this {
    this.nameEl.setText(name);
    return this;
  }

  setDesc(description: string | DocumentFragment): this {
    this.descEl.empty();
    this.descEl.append(description);
    return this;
  }

  setHeading(): this {
    this.settingEl.addClass('setting-item-heading');
    return this;
  }

  addComponent(callback: (element: HTMLElement) => unknown): this {
    callback(this.controlEl);
    return this;
  }

  addButton(callback: (button: ButtonComponent) => void): this {
    callback(new ButtonComponent(this.controlEl));
    return this;
  }

  addSearch(callback: (search: SearchComponent) => void): this {
    callback(new SearchComponent(this.controlEl));
    return this;
  }

  addText(callback: (text: TextComponent) => void): this {
    callback(new TextComponent(this.controlEl));
    return this;
  }

  addToggle(callback: (toggle: ToggleComponent) => void): this {
    callback(new ToggleComponent(this.controlEl));
    return this;
  }
}

class InputComponent {
  public readonly inputEl: HTMLInputElement;

  constructor(container: HTMLElement, type = 'text') {
    this.inputEl = container.createEl('input', { type });
  }

  setValue(value: string): this {
    this.inputEl.value = value;
    return this;
  }

  setPlaceholder(value: string): this {
    this.inputEl.placeholder = value;
    return this;
  }

  onChange(callback: (value: string) => void | Promise<void>): this {
    this.inputEl.addEventListener('input', () => void callback(this.inputEl.value));
    return this;
  }
}

export class TextComponent extends InputComponent {}
export class SearchComponent extends InputComponent {
  constructor(container: HTMLElement) {
    super(container, 'search');
  }
}

export class SecretComponent extends InputComponent {
  constructor(_app: MockApp, container: HTMLElement) {
    super(container, 'password');
    this.inputEl.addClass('secret-component');
  }
}

export class ButtonComponent {
  public readonly buttonEl: HTMLButtonElement;

  constructor(container: HTMLElement) {
    this.buttonEl = container.createEl('button');
  }

  setButtonText(value: string): this {
    this.buttonEl.setText(value);
    return this;
  }

  setDisabled(value: boolean): this {
    this.buttonEl.disabled = value;
    return this;
  }

  onClick(callback: () => void | Promise<void>): this {
    this.buttonEl.addEventListener('click', () => void callback());
    return this;
  }
}

export class ToggleComponent {
  public readonly toggleEl: HTMLInputElement;

  constructor(container: HTMLElement) {
    this.toggleEl = container.createEl('input', { type: 'checkbox' });
  }

  setValue(value: boolean): this {
    this.toggleEl.checked = value;
    return this;
  }

  onChange(callback: (value: boolean) => void | Promise<void>): this {
    this.toggleEl.addEventListener('change', () => void callback(this.toggleEl.checked));
    return this;
  }
}

export interface MockApp {
  secretStorage: { getSecret: (name: string) => string | null };
  vault: {
    getAbstractFileByPath: (path: string) => TFile | TFolder | null;
    read: (file: TFile) => Promise<string>;
    create: (path: string, content: string) => Promise<TFile>;
    createFolder: (path: string) => Promise<TFolder>;
    on: (name: 'rename' | 'delete', callback: (...args: never[]) => unknown) => unknown;
  };
  metadataCache: {
    getFileCache: (file: TFile) => { frontmatter?: Record<string, unknown> } | null;
    on: (name: 'changed', callback: (...args: never[]) => unknown) => unknown;
  };
  workspace: {
    getActiveViewOfType: (type: typeof MarkdownView) => MarkdownView | null;
    getLeaf: (newLeaf: boolean) => { openFile: (file: TFile) => Promise<void> };
  };
}

export function normalizePath(path: string): string {
  return path.replace(/\\/gu, '/').replace(/\/{2,}/gu, '/').replace(/^\.\//u, '');
}

export function setIcon(element: HTMLElement, icon: string): void {
  element.dataset.icon = icon;
}

export function createFragment(callback?: (fragment: DocumentFragment) => void): DocumentFragment {
  const fragment = document.createDocumentFragment();
  callback?.(fragment);
  return fragment;
}
