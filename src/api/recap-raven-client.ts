import {
  ContractValidationError,
  assertUuid,
  parseConnectionResponse,
  parseSessionPage,
  parseSessionResponse,
  parseTranscriptResponse,
} from './contract';
import type { Campaign, Session, SessionPage, SessionSummary, SessionTranscript } from './contract';
import { RecapRavenError } from './recap-raven-error';

export const API_ORIGIN = 'https://api.recapraven.com';
const API_PATH = '/v1/integrations/obsidian';
const MAX_PAGES = 1000;
const MAX_KEY_LENGTH = 512;

export interface HttpRequest {
  readonly url: string;
  readonly method: 'GET';
  readonly headers: Readonly<Record<string, string>>;
}

export interface HttpResponse {
  readonly status: number;
  readonly body: unknown;
}

export type RequestTransport = (request: HttpRequest) => Promise<HttpResponse>;
export type SecretProvider = () => string | null | undefined;

export class RecapRavenClient {
  public constructor(
    private readonly transport: RequestTransport,
    private readonly secretProvider: SecretProvider,
  ) {}

  public async connection(): Promise<Campaign> {
    return this.parse(parseConnectionResponse, await this.get('/connection'));
  }

  public async listSessionPage(cursor?: string): Promise<SessionPage> {
    if (cursor !== undefined && !/^[A-Za-z0-9_-]{1,256}$/u.test(cursor)) {
      throw new RecapRavenError('invalid-request', 'The session cursor is invalid.');
    }
    const query = cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`;
    return this.parse(parseSessionPage, await this.get(`/sessions${query}`));
  }

  public async listAllSessions(expectedCampaignId?: string): Promise<readonly SessionSummary[]> {
    if (expectedCampaignId !== undefined) {
      this.validateUuid(expectedCampaignId, 'campaign id');
    }
    const sessions: SessionSummary[] = [];
    const sessionIds = new Set<string>();
    const cursors = new Set<string>();
    let campaignId = expectedCampaignId;
    let cursor: string | undefined;

    for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber += 1) {
      const page = await this.listSessionPage(cursor);
      for (const session of page.sessions) {
        if (sessionIds.has(session.id)) {
          throw this.unexpected('The session list contained a duplicate session.');
        }
        campaignId ??= session.campaign_id;
        if (session.campaign_id !== campaignId) {
          throw this.unexpected('The session list crossed its campaign boundary.');
        }
        sessionIds.add(session.id);
        sessions.push(session);
      }

      if (!page.has_more || page.next_cursor === null) {
        return sessions;
      }
      if (cursors.has(page.next_cursor)) {
        throw this.unexpected('The session list repeated a pagination cursor.');
      }
      cursors.add(page.next_cursor);
      cursor = page.next_cursor;
    }

    throw this.unexpected('The session list exceeded its safe pagination bound.');
  }

  public async getSession(id: string, expectedCampaignId?: string): Promise<Session> {
    this.validateUuid(id, 'session id');
    if (expectedCampaignId !== undefined) {
      this.validateUuid(expectedCampaignId, 'campaign id');
    }
    const session = this.parse(
      parseSessionResponse,
      await this.get(`/sessions/${encodeURIComponent(id)}`),
    );
    if (session.id !== id) {
      throw this.unexpected('The session response did not match the requested session.');
    }
    if (expectedCampaignId !== undefined && session.campaign_id !== expectedCampaignId) {
      throw this.unexpected('The session response crossed its campaign boundary.');
    }
    return session;
  }

  public async getTranscript(id: string, expectedCampaignId: string): Promise<SessionTranscript> {
    this.validateUuid(id, 'session id');
    this.validateUuid(expectedCampaignId, 'campaign id');
    const transcript = this.parse(
      parseTranscriptResponse,
      await this.get(`/sessions/${encodeURIComponent(id)}/transcript`, 'transcript'),
    );
    if (transcript.session_id !== id || transcript.campaign_id !== expectedCampaignId) {
      throw this.unexpected('The transcript response did not match the requested session and campaign.');
    }
    return transcript;
  }

  private async get(path: string, resource: 'recap' | 'transcript' = 'recap'): Promise<unknown> {
    const key = this.key();
    let response: HttpResponse;
    try {
      response = await this.transport({
        url: `${API_ORIGIN}${API_PATH}${path}`,
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${key}`,
        },
      });
    } catch {
      throw new RecapRavenError(
        'unavailable',
        'Recap Raven could not be reached. Try again later.',
        null,
        true,
      );
    }
    if (response.status < 200 || response.status >= 300) {
      throw errorForStatus(response.status, resource);
    }
    return response.body;
  }

  private key(): string {
    const key = this.secretProvider()?.trim() ?? '';
    if (key === '') {
      throw new RecapRavenError('missing-key', 'Choose a Recap Raven export key in settings.');
    }
    if (!key.startsWith('raven_obs_') || key.length > MAX_KEY_LENGTH || /\s/u.test(key)) {
      throw new RecapRavenError(
        'invalid-key',
        'The selected secret is not a Recap Raven Obsidian export key.',
      );
    }
    return key;
  }

  private validateUuid(value: string, label: string): void {
    try {
      assertUuid(value, label);
    } catch {
      throw new RecapRavenError('invalid-request', `The ${label} is invalid.`);
    }
  }

  private unexpected(message: string): RecapRavenError {
    return new RecapRavenError('unexpected-response', message);
  }

  private parse<T>(parser: (value: unknown) => T, value: unknown): T {
    try {
      return parser(value);
    } catch (error) {
      if (error instanceof ContractValidationError) {
        throw this.unexpected('Recap Raven returned an invalid response.');
      }
      throw error;
    }
  }
}

function errorForStatus(status: number, resource: 'recap' | 'transcript'): RecapRavenError {
  switch (status) {
    case 400:
    case 422:
      return new RecapRavenError('invalid-request', 'Recap Raven rejected the request.', status);
    case 401:
      return new RecapRavenError('unauthorized', 'The export key is invalid, expired, or revoked.', status);
    case 403:
      return new RecapRavenError('forbidden', resource === 'transcript'
        ? 'Transcript access was denied. Check the export key’s transcript permission.'
        : 'This export key cannot access the requested campaign.', status);
    case 404:
      return new RecapRavenError('not-found', resource === 'transcript'
        ? 'The normalised transcript is not available for this session.'
        : 'That recap is no longer available.', status);
    case 429:
      return new RecapRavenError(
        'rate-limited',
        'Recap Raven is receiving too many requests. Wait and retry the import.',
        status,
        true,
      );
    default:
      return status >= 500
        ? new RecapRavenError('unavailable', 'Recap Raven is temporarily unavailable.', status, true)
        : new RecapRavenError('unexpected-response', 'Recap Raven returned an unexpected response.', status);
  }
}

export function asSafeRecapRavenError(error: unknown): RecapRavenError {
  if (error instanceof RecapRavenError) {
    return error;
  }
  if (error instanceof ContractValidationError) {
    return new RecapRavenError('unexpected-response', 'Recap Raven returned an invalid response.');
  }
  return new RecapRavenError('unexpected-response', 'The Recap Raven request failed.');
}
