export interface RecapRavenSettings {
  readonly secretName: string;
  readonly importFolder: string;
  readonly tags: readonly string[];
  readonly createCampaignIndex: boolean;
  readonly includeTranscripts: boolean;
}

export const DEFAULT_SETTINGS: RecapRavenSettings = Object.freeze({
  secretName: '',
  importFolder: 'Recap Raven',
  tags: Object.freeze(['recap-raven', 'session-recap']),
  createCampaignIndex: true,
  includeTranscripts: false,
});

export function normalizeSettings(value: unknown): RecapRavenSettings {
  const record = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};

  return {
    secretName: boundedText(record.secretName, 128, ''),
    importFolder: boundedText(record.importFolder, 512, DEFAULT_SETTINGS.importFolder),
    tags: normalizeTags(record.tags),
    createCampaignIndex: typeof record.createCampaignIndex === 'boolean'
      ? record.createCampaignIndex
      : DEFAULT_SETTINGS.createCampaignIndex,
    includeTranscripts: record.includeTranscripts === true,
  };
}

function boundedText(value: unknown, maximumLength: number, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = [...value]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 && codePoint !== 127;
    })
    .join('')
    .trim();
  return trimmed.length > 0 && trimmed.length <= maximumLength ? trimmed : fallback;
}

function normalizeTags(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return DEFAULT_SETTINGS.tags;
  }
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value.slice(0, 20)) {
    const tag = typeof candidate === 'string'
      ? candidate.trim().replace(/^#+/u, '').replace(/\s+/gu, '-').slice(0, 64)
      : '';
    const key = tag.toLocaleLowerCase('en-US');
    if (/^[\p{L}\p{N}_/-]+$/u.test(tag) && !seen.has(key)) {
      tags.push(tag);
      seen.add(key);
    }
  }
  return tags.length > 0 ? tags : DEFAULT_SETTINGS.tags;
}
