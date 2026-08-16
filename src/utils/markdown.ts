import type { Session } from "../api/contract";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_MARKDOWN_BYTES = 262_144;
const ACTIVE_MARKDOWN = [
  /<\/?[a-z][^>]*>/i,
  /<!--|<!doctype/i,
  /!?\[\[/,
  /!?\[[^\]\r\n]*\]\s*\([^\r\n)]*\)/,
  /!?\[[^\]\r\n]*\]\s*\[[^\]\r\n]*\]/,
  /^\s{0,3}\[[^\]\r\n]+\]:/m,
  /(?:https?|javascript|data|file|obsidian|vscode):/i,
  /\{\{|\{%|<%/,
  /(?:```|~~~)\s*dataview(?:js)?\b/i,
  /\$=/,
  /`\s*\$?=\s*[^`]+`/,
];

export class UnsafeSessionContentError extends Error {
  constructor(message = "The session recap did not pass the safety check.") {
    super(message);
    this.name = "UnsafeSessionContentError";
  }
}

export async function validateSessionContent(
  session: Session,
  expectedSessionId: string,
  expectedCampaignId: string,
): Promise<void> {
  if (
    !UUID.test(expectedSessionId) ||
    !UUID.test(expectedCampaignId) ||
    session.id.toLocaleLowerCase("en-US") !== expectedSessionId.toLocaleLowerCase("en-US") ||
    session.campaign_id.toLocaleLowerCase("en-US") !== expectedCampaignId.toLocaleLowerCase("en-US") ||
    session.content_type !== "text/markdown" ||
    !SHA256.test(session.content_sha256) ||
    !isTrustedRecapSource(session.source_url, expectedSessionId)
  ) {
    throw new UnsafeSessionContentError();
  }

  const bytes = new TextEncoder().encode(session.markdown);
  if (bytes.length > MAX_MARKDOWN_BYTES || hasDisallowedControl(session.markdown)) {
    throw new UnsafeSessionContentError();
  }
  if (ACTIVE_MARKDOWN.some((pattern) => pattern.test(session.markdown))) {
    throw new UnsafeSessionContentError();
  }

  const actualHash = await sha256Hex(bytes);
  if (!timingSafeEqual(actualHash, session.content_sha256)) {
    throw new UnsafeSessionContentError();
  }
}

export function isTrustedRecapSource(source: string, sessionId: string): boolean {
  try {
    const url = new URL(source);
    return (
      url.protocol === "https:" &&
      url.hostname === "recapraven.com" &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "" &&
      url.pathname === `/recaps/${sessionId}`
    );
  } catch {
    return false;
  }
}

export async function sha256Hex(input: Uint8Array): Promise<string> {
  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function hasDisallowedControl(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint === 0 || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
}
