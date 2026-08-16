const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,256}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const MAX_MARKDOWN_LENGTH = 262_144;

export interface Campaign {
  readonly id: string;
  readonly name: string;
  readonly updated_at: string;
  readonly source_url: string;
}

export interface SessionSummary {
  readonly id: string;
  readonly campaign_id: string;
  readonly session_number: number | null;
  readonly title: string | null;
  readonly recorded_at: string | null;
  readonly ready_at: string;
  readonly artifact_created_at: string;
  readonly source_url: string;
}

export interface Session extends SessionSummary {
  readonly content_type: 'text/markdown';
  readonly markdown: string;
  readonly content_sha256: string;
}

export interface SessionPage {
  readonly sessions: readonly SessionSummary[];
  readonly next_cursor: string | null;
  readonly has_more: boolean;
  readonly page_size: 100;
}

export function assertUuid(value: string, field = 'id'): void {
  if (!UUID_PATTERN.test(value)) {
    throw new ContractValidationError(`${field} must be a UUID.`);
  }
}

export function parseConnectionResponse(value: unknown): Campaign {
  const envelope = objectWithExactKeys(value, ['campaign'], 'connection response');
  return parseCampaign(envelope.campaign);
}

export function parseSessionPage(value: unknown): SessionPage {
  const envelope = objectWithExactKeys(
    value,
    ['sessions', 'next_cursor', 'has_more', 'page_size'],
    'session page',
  );
  if (!Array.isArray(envelope.sessions) || envelope.sessions.length > 100) {
    throw new ContractValidationError('sessions must contain at most 100 items.');
  }

  const sessions = envelope.sessions.map(parseSessionSummary);
  const ids = new Set(sessions.map(({ id }) => id));
  if (ids.size !== sessions.length) {
    throw new ContractValidationError('sessions contains duplicate ids.');
  }

  const nextCursor = nullableString(envelope.next_cursor, 'next_cursor');
  if (nextCursor !== null && !CURSOR_PATTERN.test(nextCursor)) {
    throw new ContractValidationError('next_cursor is malformed.');
  }
  const hasMore = booleanValue(envelope.has_more, 'has_more');
  if ((hasMore && nextCursor === null) || (!hasMore && nextCursor !== null)) {
    throw new ContractValidationError('has_more and next_cursor are inconsistent.');
  }
  if (envelope.page_size !== 100) {
    throw new ContractValidationError('page_size must be 100.');
  }

  return {
    sessions,
    next_cursor: nextCursor,
    has_more: hasMore,
    page_size: 100,
  };
}

export function parseSessionResponse(value: unknown): Session {
  const envelope = objectWithExactKeys(value, ['session'], 'session response');
  const session = objectWithExactKeys(
    envelope.session,
    [
      'id',
      'campaign_id',
      'session_number',
      'title',
      'recorded_at',
      'ready_at',
      'artifact_created_at',
      'source_url',
      'content_type',
      'markdown',
      'content_sha256',
    ],
    'session',
  );
  const summary = parseSessionSummaryFields(session);
  if (session.content_type !== 'text/markdown') {
    throw new ContractValidationError('content_type must be text/markdown.');
  }
  const markdown = stringValue(session.markdown, 'markdown');
  if (markdown.length === 0 || markdown.length > MAX_MARKDOWN_LENGTH) {
    throw new ContractValidationError('markdown has an invalid length.');
  }
  const contentSha256 = stringValue(session.content_sha256, 'content_sha256');
  if (!SHA256_PATTERN.test(contentSha256)) {
    throw new ContractValidationError('content_sha256 is malformed.');
  }

  return {
    ...summary,
    content_type: 'text/markdown',
    markdown,
    content_sha256: contentSha256,
  };
}

export class ContractValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ContractValidationError';
  }
}

function parseCampaign(value: unknown): Campaign {
  const campaign = objectWithExactKeys(value, ['id', 'name', 'updated_at', 'source_url'], 'campaign');
  const id = uuidValue(campaign.id, 'campaign.id');
  return {
    id,
    name: nonEmptyString(campaign.name, 'campaign.name'),
    updated_at: dateTimeValue(campaign.updated_at, 'campaign.updated_at'),
    source_url: recapRavenUrl(campaign.source_url, `/campaigns/${id}`, 'campaign.source_url'),
  };
}

function parseSessionSummary(value: unknown): SessionSummary {
  const session = objectWithExactKeys(
    value,
    [
      'id',
      'campaign_id',
      'session_number',
      'title',
      'recorded_at',
      'ready_at',
      'artifact_created_at',
      'source_url',
    ],
    'session summary',
  );
  return parseSessionSummaryFields(session);
}

function parseSessionSummaryFields(session: Readonly<Record<string, unknown>>): SessionSummary {
  const id = uuidValue(session.id, 'session.id');
  const campaignId = uuidValue(session.campaign_id, 'session.campaign_id');
  const sessionNumber = session.session_number;
  if (
    sessionNumber !== null
    && (!Number.isInteger(sessionNumber) || (sessionNumber as number) < 0 || (sessionNumber as number) > 9999)
  ) {
    throw new ContractValidationError('session.session_number is invalid.');
  }

  return {
    id,
    campaign_id: campaignId,
    session_number: sessionNumber as number | null,
    title: nullableString(session.title, 'session.title'),
    recorded_at: nullableDateTime(session.recorded_at, 'session.recorded_at'),
    ready_at: dateTimeValue(session.ready_at, 'session.ready_at'),
    artifact_created_at: dateTimeValue(session.artifact_created_at, 'session.artifact_created_at'),
    source_url: recapRavenUrl(session.source_url, `/recaps/${id}`, 'session.source_url'),
  };
}

function objectWithExactKeys(
  value: unknown,
  keys: readonly string[],
  field: string,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ContractValidationError(`${field} must be an object.`);
  }
  const record = value as Readonly<Record<string, unknown>>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ContractValidationError(`${field} has unexpected fields.`);
  }
  return record;
}

function uuidValue(value: unknown, field: string): string {
  const parsed = stringValue(value, field);
  assertUuid(parsed, field);
  return parsed;
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new ContractValidationError(`${field} must be a string.`);
  }
  return value;
}

function nonEmptyString(value: unknown, field: string): string {
  const parsed = stringValue(value, field);
  if (parsed.trim().length === 0) {
    throw new ContractValidationError(`${field} must not be empty.`);
  }
  return parsed;
}

function nullableString(value: unknown, field: string): string | null {
  return value === null ? null : stringValue(value, field);
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ContractValidationError(`${field} must be a boolean.`);
  }
  return value;
}

function dateTimeValue(value: unknown, field: string): string {
  const parsed = stringValue(value, field);
  if (!RFC3339_PATTERN.test(parsed) || Number.isNaN(Date.parse(parsed))) {
    throw new ContractValidationError(`${field} must be an RFC 3339 timestamp.`);
  }
  return parsed;
}

function nullableDateTime(value: unknown, field: string): string | null {
  return value === null ? null : dateTimeValue(value, field);
}

function recapRavenUrl(value: unknown, expectedPath: string, field: string): string {
  const parsed = stringValue(value, field);
  let url: URL;
  try {
    url = new URL(parsed);
  } catch {
    throw new ContractValidationError(`${field} must be a URL.`);
  }
  if (
    url.origin !== 'https://recapraven.com'
    || url.pathname !== expectedPath
    || url.search !== ''
    || url.hash !== ''
    || url.username !== ''
    || url.password !== ''
  ) {
    throw new ContractValidationError(`${field} is not an allowed Recap Raven URL.`);
  }
  return url.toString();
}
