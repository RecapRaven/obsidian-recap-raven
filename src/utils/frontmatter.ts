import type { Campaign, Session } from "../api/contract";

const MAX_TAGS = 32;
const MAX_TAG_LENGTH = 64;
type YamlValue = string | number | null | readonly string[];

export interface NoteProperties {
  readonly recap_raven_session_id: string;
  readonly recap_raven_campaign_id: string;
  readonly recap_raven_campaign: string;
  readonly session_number: number | null;
  readonly title: string | null;
  readonly recorded_at: string | null;
  readonly ready_at: string;
  readonly artifact_created_at: string;
  readonly source_url: string;
  readonly content_sha256: string;
  readonly tags: readonly string[];
}

export function buildSessionNote(session: Session, campaign: Campaign, tags: readonly string[]): string {
  const properties: NoteProperties = {
    recap_raven_session_id: session.id,
    recap_raven_campaign_id: session.campaign_id,
    recap_raven_campaign: neutralizeExecutionDelimiters(campaign.name),
    session_number: session.session_number,
    title: session.title === null ? null : neutralizeExecutionDelimiters(session.title),
    recorded_at: session.recorded_at,
    ready_at: session.ready_at,
    artifact_created_at: session.artifact_created_at,
    source_url: session.source_url,
    content_sha256: session.content_sha256,
    tags: normalizeTags(tags),
  };

  const entries: readonly (readonly [string, YamlValue])[] = [
    ["recap_raven_session_id", properties.recap_raven_session_id],
    ["recap_raven_campaign_id", properties.recap_raven_campaign_id],
    ["recap_raven_campaign", properties.recap_raven_campaign],
    ["session_number", properties.session_number],
    ["title", properties.title],
    ["recorded_at", properties.recorded_at],
    ["ready_at", properties.ready_at],
    ["artifact_created_at", properties.artifact_created_at],
    ["source_url", properties.source_url],
    ["content_sha256", properties.content_sha256],
    ["tags", properties.tags],
  ];
  const lines = entries.map(([key, value]) => `${key}: ${yamlValue(value)}`);
  return `---\n${lines.join("\n")}\n---\n\n${session.markdown}`;
}

/** Content for a create-only index. Callers must never replace an existing index file. */
export function buildCampaignIndexNote(campaign: Campaign, sessionsFolderPath: string): string {
  const entries: readonly (readonly [string, YamlValue])[] = [
    ["recap_raven_campaign_id", campaign.id],
    ["recap_raven_campaign", neutralizeExecutionDelimiters(campaign.name)],
    ["source_url", campaign.source_url],
  ];
  const lines = entries.map(([key, value]) => `${key}: ${yamlValue(value)}`);
  const heading = escapeMarkdownText(neutralizeExecutionDelimiters(campaign.name));
  const queryPath = sessionsFolderPath.replace(/[\\"`\r\n]/gu, "-");
  return `---\n${lines.join("\n")}\n---\n\n# ${heading}\n\n[Open campaign in Recap Raven](${campaign.source_url})\n\n## Session recaps\n\nThis list updates automatically as recaps are imported.\n\n\`\`\`query\npath:"${queryPath}"\n\`\`\`\n`;
}

export function normalizeTags(tags: readonly string[]): readonly string[] {
  const unique = new Set<string>();
  for (const rawTag of tags) {
    const tag = neutralizeExecutionDelimiters(rawTag).trim().replace(/^#+/, "");
    if (tag !== "" && Array.from(tag).length <= MAX_TAG_LENGTH) {
      unique.add(tag);
    }
    if (unique.size === MAX_TAGS) {
      break;
    }
  }
  return [...unique];
}

/** Removes execution delimiters recognized by Templater and inline Dataview. */
export function neutralizeExecutionDelimiters(value: string): string {
  return value
    .normalize("NFKC")
    .replaceAll("<%", "&lt;%")
    .replaceAll("{{", "&#123;{")
    .replaceAll("{%", "&#123;%")
    .replaceAll("$=", "&#36;&#61;")
    .replace(/`\s*=/g, "`&#61;");
}

function yamlValue(value: YamlValue): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? String(value) : "null";
  }
  return JSON.stringify(value);
}

function escapeMarkdownText(value: string): string {
  const markdownPunctuation = new Set("\\`*_{}[]()<>#+.!|~-".split(""));
  return Array.from(value.normalize("NFKC"))
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) {
        return " ";
      }
      return markdownPunctuation.has(character) ? `\\${character}` : character;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
