import { beforeEach } from 'vitest';
import { createFragment, resetObsidianMock } from './mocks/obsidian';

declare global {
  interface HTMLElement {
    addClass(...classes: string[]): void;
    createDiv(options?: { cls?: string; text?: string }): HTMLDivElement;
    createEl<K extends keyof HTMLElementTagNameMap>(
      tag: K,
      options?: { cls?: string; text?: string; type?: string; href?: string },
    ): HTMLElementTagNameMap[K];
    createSpan(options?: { cls?: string; text?: string }): HTMLSpanElement;
    empty(): void;
    setText(text: string): void;
  }

  interface DocumentFragment {
    createEl<K extends keyof HTMLElementTagNameMap>(
      tag: K,
      options?: { cls?: string; text?: string; type?: string; href?: string },
    ): HTMLElementTagNameMap[K];
  }
}

function classes(value: string | undefined): string[] {
  return value?.split(/\s+/u).filter(Boolean) ?? [];
}

HTMLElement.prototype.addClass = function addClass(...values: string[]): void {
  this.classList.add(...values);
};
HTMLElement.prototype.createEl = function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: { cls?: string; text?: string; type?: string; href?: string } = {},
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.classList.add(...classes(options.cls));
  if (options.text !== undefined) element.textContent = options.text;
  if (options.type !== undefined && element instanceof HTMLInputElement) element.type = options.type;
  if (options.href !== undefined && element instanceof HTMLAnchorElement) element.href = options.href;
  this.append(element);
  return element;
};
HTMLElement.prototype.createDiv = function createDiv(options = {}): HTMLDivElement {
  return this.createEl('div', options);
};
HTMLElement.prototype.createSpan = function createSpan(options = {}): HTMLSpanElement {
  return this.createEl('span', options);
};
HTMLElement.prototype.empty = function empty(): void {
  this.replaceChildren();
};
HTMLElement.prototype.setText = function setText(text: string): void {
  this.textContent = text;
};
DocumentFragment.prototype.createEl = function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: { cls?: string; text?: string; type?: string; href?: string } = {},
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.classList.add(...classes(options.cls));
  if (options.text !== undefined) element.textContent = options.text;
  if (options.type !== undefined && element instanceof HTMLInputElement) element.type = options.type;
  if (options.href !== undefined && element instanceof HTMLAnchorElement) element.href = options.href;
  this.append(element);
  return element;
};
globalThis.createFragment = createFragment;

beforeEach(() => {
  document.body.empty();
  resetObsidianMock();
});
