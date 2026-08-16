import { describe, expect, it } from 'vitest';

import {
  ContractValidationError,
  parseConnectionResponse,
  parseSessionPage,
  parseSessionResponse,
} from '../../src/api/contract';

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';

describe('Recap Raven API contract', () => {
  it('parses a campaign-bound connection response', () => {
    expect(parseConnectionResponse({
      campaign: {
        id: CAMPAIGN_ID,
        name: 'The Glass Archive',
        updated_at: '2026-08-16T12:00:00Z',
        source_url: `https://recapraven.com/campaigns/${CAMPAIGN_ID}`,
      },
    })).toMatchObject({ id: CAMPAIGN_ID, name: 'The Glass Archive' });
  });

  it('rejects unexpected fields and off-origin source URLs', () => {
    expect(() => parseConnectionResponse({
      campaign: {
        id: CAMPAIGN_ID,
        name: 'The Glass Archive',
        updated_at: '2026-08-16T12:00:00Z',
        source_url: `https://evil.example/campaigns/${CAMPAIGN_ID}`,
        owner_email: 'secret@example.com',
      },
    })).toThrow(ContractValidationError);
  });

  it('requires pagination flags and cursors to agree', () => {
    expect(() => parseSessionPage({
      sessions: [],
      next_cursor: null,
      has_more: true,
      page_size: 100,
    })).toThrow('has_more and next_cursor are inconsistent');
  });

  it('rejects duplicate session ids within a page', () => {
    const summary = sessionSummary();
    expect(() => parseSessionPage({
      sessions: [summary, summary],
      next_cursor: null,
      has_more: false,
      page_size: 100,
    })).toThrow('sessions contains duplicate ids');
  });

  it('parses bounded Markdown detail', () => {
    const parsed = parseSessionResponse({
      session: {
        ...sessionSummary(),
        content_type: 'text/markdown',
        markdown: '# Through the Silver Door\n',
        content_sha256: 'a'.repeat(64),
      },
    });
    expect(parsed.markdown).toBe('# Through the Silver Door\n');
    expect(parsed.content_sha256).toBe('a'.repeat(64));
  });

  it('rejects oversized Markdown and malformed content hashes', () => {
    expect(() => parseSessionResponse({
      session: {
        ...sessionSummary(),
        content_type: 'text/markdown',
        markdown: 'x'.repeat(262_145),
        content_sha256: 'not-a-hash',
      },
    })).toThrow(ContractValidationError);
  });
});

function sessionSummary(): Record<string, unknown> {
  return {
    id: SESSION_ID,
    campaign_id: CAMPAIGN_ID,
    session_number: 1,
    title: 'Through the Silver Door',
    recorded_at: '2026-08-15T19:00:00Z',
    ready_at: '2026-08-16T10:00:00Z',
    artifact_created_at: '2026-08-16T10:00:00Z',
    source_url: `https://recapraven.com/recaps/${SESSION_ID}`,
  };
}
