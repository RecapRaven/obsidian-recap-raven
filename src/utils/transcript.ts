import { MAX_TRANSCRIPT_BYTES } from '../api/contract';
import type { SessionTranscript } from '../api/contract';
import { sha256Hex } from './markdown';
import { normalizeImportRoot } from './paths';

export function transcriptNotePath(recapPath: string): string {
  const folder = recapPath.slice(0, -3);
  if (!recapPath.endsWith('.md') || folder.includes('\\')) {
    throw new Error('The recap path cannot contain a transcript folder.');
  }
  // Validate the location without rewriting the name of an existing recap.
  normalizeImportRoot(folder);
  return `${folder}/Transcript.md`;
}

/** Encode every path segment so note titles cannot alter a generated Markdown link. */
export function noteLink(label: string, path: string): string {
  const destination = path.split('/').map((segment) => encodeURIComponent(segment)
    .replace(/[!'()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
  return `[${label}](${destination})`;
}

export async function validateTranscript(
  transcript: SessionTranscript,
  sessionId: string,
  campaignId: string,
): Promise<void> {
  const bytes = new TextEncoder().encode(transcript.text);
  if (transcript.session_id !== sessionId || transcript.campaign_id !== campaignId
    || transcript.content_type !== 'text/plain' || bytes.length === 0 || bytes.length > MAX_TRANSCRIPT_BYTES
    || hasUnsupportedControl(transcript.text)
    || await sha256Hex(bytes) !== transcript.content_sha256) {
    throw new Error('The transcript did not pass the integrity check.');
  }
}

export function buildTranscriptNote(transcript: SessionTranscript, recapPath: string): string {
  const properties = [
    `recap_raven_transcript_session_id: ${JSON.stringify(transcript.session_id)}`,
    `recap_raven_campaign_id: ${JSON.stringify(transcript.campaign_id)}`,
    `artifact_created_at: ${JSON.stringify(transcript.artifact_created_at)}`,
    `content_sha256: ${JSON.stringify(transcript.content_sha256)}`,
  ];
  // Keep encoded text in a pre element, outside Dataview's inline-field and code processors.
  const text = transcript.text.replace(/[!-/:-@[-`{-~]/gu,
    (character) => `&#${character.charCodeAt(0)};`).replace(/\r\n?/gu, '\n');
  const filename = recapPath.slice(recapPath.lastIndexOf('/') + 1);
  return `---\n${properties.join('\n')}\n---\n\n# Session transcript\n\n${noteLink('Back to recap', `../${filename}`)}\n\n<pre class="recap-raven-transcript">${text}</pre>\n`;
}

function hasUnsupportedControl(text: string): boolean {
  for (const character of text) {
    const code = character.charCodeAt(0);
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || (code >= 127 && code <= 159)) {
      return true;
    }
  }
  return false;
}
