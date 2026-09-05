import { describe, expect, it } from 'vitest';
import { MAX_TRANSCRIPT_BYTES, parseTranscriptResponse } from '../../src/api/contract';
import type { SessionTranscript } from '../../src/api/contract';
import { sessionIdFromFrontmatter } from '../../src/import/session-identity';
import { sha256Hex } from '../../src/utils/markdown';
import { buildTranscriptNote, noteLink, transcriptNotePath, validateTranscript } from '../../src/utils/transcript';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const CAMPAIGN_ID = '22222222-2222-4222-8222-222222222222';

async function transcript(text = '[00:01] Guide: The door opens.'): Promise<SessionTranscript> {
  return {
    session_id: SESSION_ID,
    campaign_id: CAMPAIGN_ID,
    artifact_created_at: '2026-09-05T12:00:00Z',
    content_type: 'text/plain',
    text,
    content_sha256: await sha256Hex(new TextEncoder().encode(text)),
  };
}

describe('transcript contract and integrity', () => {
  it('accepts the exact plain-text response and verifies its UTF-8 digest', async () => {
    const source = await transcript('[00:01] Guide: Zażółć — 你好.');
    const parsed = parseTranscriptResponse({ transcript: source });
    expect(parsed).toEqual(source);
    await expect(validateTranscript(parsed, SESSION_ID, CAMPAIGN_ID)).resolves.toBeUndefined();
  });

  it.each([
    { gm_notes: 'unexpected' },
    { text: '' },
    { text: 42 },
    { session_id: '../private' },
    { campaign_id: null },
    { content_type: 'text/html' },
    { content_sha256: 'invalid' },
    { artifact_created_at: 'yesterday' },
  ])('rejects malformed response fields: %j', async (patch) => {
    const awaited = await transcript();
    expect(() => parseTranscriptResponse({ transcript: { ...awaited, ...patch } })).toThrow();
  });

  it('rejects extra envelopes and missing fields', async () => {
    expect(() => parseTranscriptResponse({ transcript: null })).toThrow();
    expect(() => parseTranscriptResponse({ transcript: {} })).toThrow();
    const source = await transcript();
    expect(() => parseTranscriptResponse({ transcript: source, raw: 'extra' })).toThrow();
  });

  it('rejects a mismatched digest or identity', async () => {
    const source = await transcript();
    await expect(validateTranscript({ ...source, text: 'tampered' }, SESSION_ID, CAMPAIGN_ID)).rejects.toThrow();
    await expect(validateTranscript(source, CAMPAIGN_ID, CAMPAIGN_ID)).rejects.toThrow();
    await expect(validateTranscript(source, SESSION_ID, SESSION_ID)).rejects.toThrow();
  });

  it('bounds UTF-8 bytes and rejects controls before rendering', async () => {
    const large = await transcript('界'.repeat(Math.floor(MAX_TRANSCRIPT_BYTES / 3) + 1));
    await expect(validateTranscript(large, SESSION_ID, CAMPAIGN_ID)).rejects.toThrow();
    const control = await transcript('turn\u0000hidden');
    await expect(validateTranscript(control, SESSION_ID, CAMPAIGN_ID)).rejects.toThrow();
  });
});

describe('transcript note rendering', () => {
  it('makes hostile transcript content inert while preserving displayed text', async () => {
    const source = await transcript('[00:01] Guide: <script>alert(1)</script> [[Private]]\n'
      + '<% tp.file.create_new("x") %> `= this.file` $= window.close()\n'
      + '```dataviewjs\nfetch("https://example.invalid")\n```\n![image](file:///secret)\n'
      + '[field:: ![image](https://example.invalid/pixel)]\n'
      + '[field:: `$= window.close()`]\n</pre><code>$= window.close()</code>\n'
      + '---\nrecap_raven_session_id: forged');
    const note = buildTranscriptNote(source, 'Recaps/Session [1] (Door).md');
    const body = note.slice(note.indexOf('[Back to recap]'));
    expect(note).toContain(`recap_raven_transcript_session_id: "${SESSION_ID}"`);
    expect(note).not.toContain('recap_raven_session_id:');
    expect(body).not.toMatch(/<script|\[\[|<%|`=|\$=|```|https:|file:/u);
    expect(body).toContain('[Back to recap](../Session%20%5B1%5D%20%28Door%29.md)');
    const renderedText = new DOMParser().parseFromString(
      body.slice(body.indexOf('\n\n') + 2).trimEnd(), 'text/html',
    );
    expect(renderedText.body.textContent).toBe(source.text);
    expect(renderedText.body.querySelectorAll('*')).toHaveLength(1);
    expect(renderedText.body.querySelector('pre')?.className).toBe('recap-raven-transcript');
    // Dataview can render inline fields and code as Markdown again after HTML entity decoding.
    expect(renderedText.body.querySelector('p, h1, h2, h3, h4, h5, h6, li, span, th, td, code')).toBeNull();
    expect(renderedText.body.querySelector('img, script, iframe')).toBeNull();
    expect(sessionIdFromFrontmatter({ recap_raven_transcript_session_id: SESSION_ID })).toBeNull();
  });

  it('encodes path punctuation and refuses unsafe companion folders', () => {
    expect(transcriptNotePath('Recaps/Session [1].md')).toBe('Recaps/Session [1]/Transcript.md');
    expect(noteLink('Transcript', './Session #1 [x](a).md/Transcript.md'))
      .toBe('[Transcript](./Session%20%231%20%5Bx%5D%28a%29.md/Transcript.md)');
    for (const path of ['../secret.md', '/absolute.md', `.${'obsidian'}/private.md`, 'C:/note.md', 'note.txt']) {
      expect(() => transcriptNotePath(path)).toThrow();
    }
  });
});
