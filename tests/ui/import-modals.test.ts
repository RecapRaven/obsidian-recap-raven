import type { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { chooseSessions, previewImport } from '../../src/ui/import-modals';
import type { ImportPlan } from '../../src/ui/types';
import type { MockApp } from '../mocks/obsidian';

const app = {} as MockApp;
const plan: ImportPlan = {
  campaignId: '11111111-1111-4111-8111-111111111111',
  campaignName: 'The Glass Archive',
  items: [
    {
      sessionId: '22222222-2222-4222-8222-222222222222',
      title: 'Through the Silver Door',
      sessionNumber: 1,
      recordedAt: '2026-08-15T19:00:00Z',
      destinationPath: 'Recap Raven/The Glass Archive/Sessions/Session 1 - Through the Silver Door.md',
      state: 'new',
    },
    {
      sessionId: '33333333-3333-4333-8333-333333333333',
      title: 'Echoes in Glass',
      sessionNumber: 2,
      recordedAt: '2026-08-16T19:00:00Z',
      destinationPath: 'Recap Raven/The Glass Archive/Sessions/Session 2 - Echoes in Glass.md',
      existingPath: 'Moved/Echoes in Glass.md',
      state: 'imported',
    },
  ],
};

describe('import modal accessibility', () => {
  it('labels its dialog and controls and exposes disabled states', async () => {
    const result = chooseSessions(app as unknown as App, plan, false);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-label')).toBe('Import session recaps');

    const search = dialog?.querySelector<HTMLInputElement>('input[type="search"]');
    expect(search?.placeholder).toBe('Title, session number, or date');
    const checkboxes = [...(dialog?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? [])];
    expect(checkboxes.map((input) => input.getAttribute('aria-label'))).toEqual([
      'Select Session 2: Echoes in Glass',
      'Select Session 1: Through the Silver Door',
    ]);
    expect(checkboxes[0]?.disabled).toBe(true);
    const sessionNumbers = [...(dialog?.querySelectorAll('.recap-raven-session-title strong') ?? [])]
      .map((element) => element.textContent);
    expect(sessionNumbers).toEqual(['Session 2:', 'Session 1:']);
    expect(button('Preview plan').disabled).toBe(true);
    expect(button('Import selected').disabled).toBe(true);

    checkboxes[1]?.click();
    expect(button('Preview plan').disabled).toBe(false);
    expect(button('Import selected').disabled).toBe(false);
    button('Cancel').click();
    await expect(result).resolves.toEqual({ action: 'cancel' });
  });

  it('keeps the standalone preview strictly read-only', async () => {
    const result = previewImport(
      app as unknown as App,
      plan,
      ['22222222-2222-4222-8222-222222222222'],
      false,
    );
    expect(document.body.textContent).toContain('No notes have been changed.');
    expect(document.body.textContent).not.toContain('Import');
    expect(document.querySelector('.recap-raven-plan-session strong')?.textContent).toBe('Session 1:');
    expect(document.querySelector('.recap-raven-plan-action')?.textContent).toBe(
      'Create Recap Raven/The Glass Archive/Sessions/Session 1 - Through the Silver Door.md',
    );
    const close = button('Close');
    expect(close.classList.contains('mod-cta')).toBe(true);
    close.click();
    await expect(result).resolves.toBe(false);
  });

  it('renders an occupied destination as a warning and shows its alternate path', async () => {
    const collisionPlan: ImportPlan = {
      ...plan,
      items: [{
        ...plan.items[0]!,
        state: 'collision',
        destinationPath: 'Recap Raven/The Glass Archive/Sessions/2026-08-15 - Session 1 - Through the Silver Door [22222222].md',
      }],
    };
    const result = previewImport(
      app as unknown as App,
      collisionPlan,
      ['22222222-2222-4222-8222-222222222222'],
      false,
    );

    const warning = document.querySelector('.recap-raven-session-warning');
    expect(warning?.textContent).toBe('Destination occupied — an alternate filename will be created.');
    expect(warning?.querySelector('[data-icon="triangle-alert"]')).not.toBeNull();
    expect(document.querySelector('.recap-raven-plan-action')?.textContent).toContain(
      '2026-08-15 - Session 1 - Through the Silver Door [22222222].md',
    );

    button('Close').click();
    await expect(result).resolves.toBe(false);
  });
});

function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent === name);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`Missing button ${name}`);
  return found;
}
