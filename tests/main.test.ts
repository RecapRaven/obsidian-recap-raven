import type { App, PluginManifest } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import RecapRavenPlugin from '../src/main';
import { sha256Hex } from '../src/utils/markdown';
import {
  MarkdownView,
  TFile,
  TFolder,
  notices,
  requestUrl,
} from './mocks/obsidian';
import type { MockApp, MockCommand } from './mocks/obsidian';

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_IDS = [
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
] as const;
const KEY = 'raven_obs_test-only-credential-000000000000';

interface PluginHarness {
  plugin: RecapRavenPlugin;
  app: MockApp;
  files: Map<string, TFile | TFolder>;
  secret: ReturnType<typeof vi.fn<(name: string) => string | null>>;
  commands: MockCommand[];
}

describe('production plugin orchestration', () => {
  it('keeps networking manual, resolves only the SecretStorage reference, previews, and creates exclusively', async () => {
    const harness = await pluginHarness();
    const canonical = 'Recap Raven/The Glass Archive/Sessions/2026-08-11 - Session 1 - Through the Silver Door.md';
    harness.files.set(canonical, new TFile(canonical, 'user-owned original'));

    expect(requestUrl).not.toHaveBeenCalled();
    expect(harness.secret).not.toHaveBeenCalled();
    expect(harness.commands.map(({ id }) => id)).toEqual([
      'import-session-recaps',
      'import-all-new-recaps',
      'preview-new-recap-import',
      'create-campaign-index',
      'open-current-recap',
    ]);

    requestUrl
      .mockResolvedValueOnce(response(connectionEnvelope()))
      .mockResolvedValueOnce(response(sessionPage([sessionSummary(SESSION_IDS[0], 1)])))
      .mockResolvedValueOnce(response(await sessionEnvelope(SESSION_IDS[0], 1)));

    command(harness, 'import-session-recaps').callback?.();
    await waitFor(() => document.querySelector('[role="dialog"]') !== null);

    expect(harness.secret).toHaveBeenCalledWith('rr-export-key');
    expect(requestUrl).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Import session recaps');
    const checkbox = document.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(checkbox?.getAttribute('aria-label')).toBe('Select Session 1: Through the Silver Door');
    checkbox?.click();
    button('Preview plan').click();
    await waitFor(() => document.body.textContent?.includes('No notes have been changed.') === true);

    expect(document.body.textContent).toContain('No notes have been changed.');
    expect(requestUrl).toHaveBeenCalledTimes(2);
    button('Import').click();
    await waitFor(() => document.body.textContent?.includes('1 imported, 0 skipped, 0 failed, 0 not attempted.') === true);

    expect(requestUrl).toHaveBeenCalledTimes(3);
    expect(harness.files.get(canonical)).toMatchObject({ content: 'user-owned original' });
    const alternate = 'Recap Raven/The Glass Archive/Sessions/2026-08-11 - Session 1 - Through the Silver Door [22222222].md';
    expect(harness.files.get(alternate)).toBeInstanceOf(TFile);
    const index = harness.files.get('Recap Raven/The Glass Archive/Campaign index.md');
    expect(index).toBeInstanceOf(TFile);
    if (!(index instanceof TFile)) throw new Error('Campaign index was not created.');
    expect(index.content).toContain(
      '```query\npath:"Recap Raven/The Glass Archive/Sessions"\n```',
    );
    expect(document.body.textContent).toContain('1 imported, 0 skipped, 0 failed, 0 not attempted.');
  });

  it('preserves a partial import, stops on fatal authentication failure, and reports unattempted recaps', async () => {
    const harness = await pluginHarness();
    requestUrl
      .mockResolvedValueOnce(response(connectionEnvelope()))
      .mockResolvedValueOnce(response(sessionPage([
        sessionSummary(SESSION_IDS[0], 1),
        sessionSummary(SESSION_IDS[1], 2),
        sessionSummary(SESSION_IDS[2], 3),
      ])))
      .mockResolvedValueOnce(response(await sessionEnvelope(SESSION_IDS[0], 1)))
      .mockResolvedValueOnce(response({ message: 'never surface raven_obs_secret' }, 401));

    command(harness, 'import-all-new-recaps').callback?.();
    await waitFor(() => findButton('Import selected') !== null);
    button('Import selected').click();
    await waitFor(() => document.body.textContent?.includes('1 imported, 0 skipped, 1 failed, 1 not attempted.') === true);

    expect(requestUrl).toHaveBeenCalledTimes(4);
    expect(document.body.textContent).toContain('1 imported, 0 skipped, 1 failed, 1 not attempted.');
    expect(document.body.textContent).toContain('not attempted because the import stopped early');
    expect(document.body.textContent).not.toContain('raven_obs_secret');
    expect([...harness.files.keys()].filter((path) => path.includes('/Sessions/'))).toHaveLength(1);
  });

  it('signposts Obsidian settings when the export key is no longer authorized', async () => {
    const harness = await pluginHarness();
    requestUrl.mockResolvedValueOnce(response({}, 401));

    command(harness, 'import-session-recaps').callback?.();
    await waitFor(() => notices.length > 0);

    expect(notices.at(-1)).toEqual({
      message: 'The export key is invalid, expired, or revoked. Open Obsidian Settings → Recap Raven to select a new key.',
      timeout: 8000,
    });
  });

  it('keeps generated indexes idempotent and preserves a user-owned canonical index', async () => {
    const harness = await pluginHarness();
    requestUrl.mockResolvedValue(response(connectionEnvelope()));
    const path = 'Recap Raven/The Glass Archive/Campaign index.md';

    command(harness, 'create-campaign-index').callback?.();
    await waitFor(() => notices.some(({ message }) => message === 'Campaign index created.'));

    const index = harness.files.get(path);
    if (!(index instanceof TFile)) throw new Error('Campaign index was not created.');
    expect(index.content).toContain('path:"Recap Raven/The Glass Archive/Sessions"');

    command(harness, 'create-campaign-index').callback?.();
    await waitFor(() => notices.some(({ message }) => message.includes('already exists')));

    expect(harness.files.get(path)).toBe(index);
    expect(harness.files.has('Recap Raven/The Glass Archive/Campaign index (Recap Raven).md')).toBe(false);

    const userContent = '# My campaign notes\n';
    harness.files.set(path, new TFile(path, userContent));
    command(harness, 'create-campaign-index').callback?.();
    await waitFor(() => notices.some(({ message }) => message.includes('alongside your existing index')));

    expect(harness.files.get(path)).toMatchObject({ content: userContent });
    const alternatePath = 'Recap Raven/The Glass Archive/Campaign index (Recap Raven).md';
    const alternate = harness.files.get(alternatePath);
    expect(alternate).toBeInstanceOf(TFile);

    command(harness, 'create-campaign-index').callback?.();
    await waitFor(() => notices.some(({ message }) => message.includes('already exists')));

    expect(harness.files.get(path)).toMatchObject({ content: userContent });
    expect(harness.files.get(alternatePath)).toBe(alternate);
    expect(requestUrl).toHaveBeenCalledTimes(4);
  });
});

async function pluginHarness(): Promise<PluginHarness> {
  const files = new Map<string, TFile | TFolder>();
  const secret = vi.fn<(name: string) => string | null>().mockReturnValue(KEY);
  const app: MockApp = {
    secretStorage: { getSecret: secret },
    vault: {
      getMarkdownFiles: () => [...files.values()].filter((file): file is TFile => file instanceof TFile),
      getAbstractFileByPath: (path) => files.get(path) ?? null,
      read: vi.fn(async (file: TFile) => file.content),
      create: vi.fn(async (path: string, content: string) => {
        if (files.has(path)) throw new Error('exists');
        const file = new TFile(path, content);
        files.set(path, file);
        return file;
      }),
      createFolder: vi.fn(async (path: string) => {
        if (files.has(path)) throw new Error('exists');
        const folder = new TFolder(path);
        files.set(path, folder);
        return folder;
      }),
    },
    metadataCache: { getFileCache: () => null },
    workspace: {
      getActiveViewOfType: () => new MarkdownView(null),
      getLeaf: () => ({ openFile: vi.fn(async () => undefined) }),
    },
  };
  const plugin = new RecapRavenPlugin(
    app as unknown as App,
    { id: 'recap-raven', name: 'Recap Raven', version: '1.0.0', minAppVersion: '1.11.4' } as PluginManifest,
  );
  (plugin as unknown as { data: unknown }).data = {
    secretName: 'rr-export-key',
    importFolder: 'Recap Raven',
    tags: ['recap-raven'],
    createCampaignIndex: true,
  };
  await plugin.onload();
  const commands = (plugin as unknown as { commands: MockCommand[] }).commands;
  return { plugin, app, files, secret, commands };
}

function command(harness: PluginHarness, id: string): MockCommand {
  const found = harness.commands.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`Missing command ${id}`);
  return found;
}

function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent === name);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`Missing button ${name}`);
  return found;
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for plugin UI state');
    await new Promise((resolve) => window.setTimeout(resolve, 5));
  }
}

function findButton(name: string): HTMLButtonElement | null {
  const found = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent === name);
  return found instanceof HTMLButtonElement ? found : null;
}

function response(json: unknown, status = 200): { status: number; json: unknown } {
  return { status, json };
}

function connectionEnvelope(): unknown {
  return {
    campaign: {
      id: CAMPAIGN_ID,
      name: 'The Glass Archive',
      updated_at: '2026-08-16T12:00:00Z',
      source_url: `https://recapraven.com/campaigns/${CAMPAIGN_ID}`,
    },
  };
}

function sessionSummary(id: string, number: number): Record<string, unknown> {
  return {
    id,
    campaign_id: CAMPAIGN_ID,
    session_number: number,
    title: number === 1 ? 'Through the Silver Door' : `Session title ${number}`,
    recorded_at: `2026-08-${String(10 + number).padStart(2, '0')}T19:00:00Z`,
    ready_at: '2026-08-16T10:00:00Z',
    artifact_created_at: '2026-08-16T10:00:00Z',
    source_url: `https://recapraven.com/recaps/${id}`,
  };
}

function sessionPage(sessions: Record<string, unknown>[]): unknown {
  return { sessions, next_cursor: null, has_more: false, page_size: 100 };
}

async function sessionEnvelope(id: string, number: number): Promise<unknown> {
  const markdown = `# Player-safe recap ${number}\n`;
  return {
    session: {
      ...sessionSummary(id, number),
      content_type: 'text/markdown',
      markdown,
      content_sha256: await sha256Hex(new TextEncoder().encode(markdown)),
    },
  };
}
