import { describe, expect, it, vi } from 'vitest';

import type { HttpResponse, RequestTransport } from '../../src/api/recap-raven-client';
import { API_ORIGIN, RecapRavenClient } from '../../src/api/recap-raven-client';
import { RecapRavenError } from '../../src/api/recap-raven-error';

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const KEY = 'raven_obs_test-key';

describe('RecapRavenClient', () => {
  it('uses only the fixed API origin and bearer export key', async () => {
    const transport = vi.fn<RequestTransport>().mockResolvedValue(connectionResponse());
    const client = new RecapRavenClient(transport, () => KEY);

    await client.connection();

    expect(transport).toHaveBeenCalledWith({
      url: `${API_ORIGIN}/v1/integrations/obsidian/connection`,
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${KEY}` },
    });
  });

  it('does not call the network without a campaign export key', async () => {
    const transport = vi.fn<RequestTransport>();
    const client = new RecapRavenClient(transport, () => 'raven_sk_full-key');

    await expect(client.connection()).rejects.toMatchObject({ code: 'invalid-key' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('encodes cursors and rejects malformed cursors before transport', async () => {
    const transport = vi.fn<RequestTransport>().mockResolvedValue(emptyPage());
    const client = new RecapRavenClient(transport, () => KEY);

    await client.listSessionPage('opaque_cursor-1');
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0]?.[0].url).toBe(
      `${API_ORIGIN}/v1/integrations/obsidian/sessions?cursor=opaque_cursor-1`,
    );
    await expect(client.listSessionPage('bad/cursor')).rejects.toMatchObject({ code: 'invalid-request' });
  });

  it('detects a repeated pagination cursor', async () => {
    const transport = vi.fn<RequestTransport>().mockResolvedValue({
      status: 200,
      body: { sessions: [], next_cursor: 'same', has_more: true, page_size: 100 },
    });
    const client = new RecapRavenClient(transport, () => KEY);

    await expect(client.listAllSessions(CAMPAIGN_ID)).rejects.toMatchObject({
      code: 'unexpected-response',
    });
  });

  it('aggregates a valid multi-page session list', async () => {
    const secondSessionId = '33333333-3333-4333-8333-333333333333';
    const transport = vi.fn<RequestTransport>()
      .mockResolvedValueOnce({
        status: 200,
        body: {
          sessions: [sessionSummary(CAMPAIGN_ID)],
          next_cursor: 'page_2',
          has_more: true,
          page_size: 100,
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          sessions: [sessionSummary(CAMPAIGN_ID, secondSessionId)],
          next_cursor: null,
          has_more: false,
          page_size: 100,
        },
      });
    const client = new RecapRavenClient(transport, () => KEY);

    await expect(client.listAllSessions(CAMPAIGN_ID)).resolves.toMatchObject([
      { id: SESSION_ID },
      { id: secondSessionId },
    ]);
    expect(transport).toHaveBeenNthCalledWith(2, expect.objectContaining({
      url: `${API_ORIGIN}/v1/integrations/obsidian/sessions?cursor=page_2`,
    }));
  });

  it('rejects a duplicate session id repeated on a later page', async () => {
    const transport = vi.fn<RequestTransport>()
      .mockResolvedValueOnce({
        status: 200,
        body: {
          sessions: [sessionSummary(CAMPAIGN_ID)],
          next_cursor: 'page_2',
          has_more: true,
          page_size: 100,
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          sessions: [sessionSummary(CAMPAIGN_ID)],
          next_cursor: null,
          has_more: false,
          page_size: 100,
        },
      });
    const client = new RecapRavenClient(transport, () => KEY);

    await expect(client.listAllSessions(CAMPAIGN_ID)).rejects.toMatchObject({
      code: 'unexpected-response',
    });
  });

  it('rejects cross-campaign sessions', async () => {
    const transport = vi.fn<RequestTransport>().mockResolvedValue({
      status: 200,
      body: {
        sessions: [sessionSummary('33333333-3333-4333-8333-333333333333')],
        next_cursor: null,
        has_more: false,
        page_size: 100,
      },
    });
    const client = new RecapRavenClient(transport, () => KEY);

    await expect(client.listAllSessions(CAMPAIGN_ID)).rejects.toMatchObject({
      code: 'unexpected-response',
    });
  });

  it('rejects mixed campaign ids even when no expected campaign is supplied', async () => {
    const otherSessionId = '44444444-4444-4444-8444-444444444444';
    const transport = vi.fn<RequestTransport>().mockResolvedValue({
      status: 200,
      body: {
        sessions: [
          sessionSummary(CAMPAIGN_ID),
          sessionSummary('33333333-3333-4333-8333-333333333333', otherSessionId),
        ],
        next_cursor: null,
        has_more: false,
        page_size: 100,
      },
    });
    const client = new RecapRavenClient(transport, () => KEY);

    await expect(client.listAllSessions()).rejects.toMatchObject({ code: 'unexpected-response' });
  });

  it('maps rate limiting without exposing the server response body', async () => {
    const transport = vi.fn<RequestTransport>().mockResolvedValue({
      status: 429,
      body: { message: `secret ${KEY}` },
    });
    const client = new RecapRavenClient(transport, () => KEY);

    const error = await client.connection().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RecapRavenError);
    expect(error).toMatchObject({ code: 'rate-limited', status: 429, retryable: true });
    expect((error as Error).message).not.toContain(KEY);
  });

  it('validates requested session identity and campaign scope', async () => {
    const transport = vi.fn<RequestTransport>().mockResolvedValue({
      status: 200,
      body: {
        session: {
          ...sessionSummary(CAMPAIGN_ID),
          content_type: 'text/markdown',
          markdown: '# Through the Silver Door\n',
          content_sha256: 'a'.repeat(64),
        },
      },
    });
    const client = new RecapRavenClient(transport, () => KEY);

    await expect(client.getSession(SESSION_ID, CAMPAIGN_ID)).resolves.toMatchObject({ id: SESSION_ID });
  });
});

function connectionResponse(): HttpResponse {
  return {
    status: 200,
    body: {
      campaign: {
        id: CAMPAIGN_ID,
        name: 'The Glass Archive',
        updated_at: '2026-08-16T12:00:00Z',
        source_url: `https://recapraven.com/campaigns/${CAMPAIGN_ID}`,
      },
    },
  };
}

function emptyPage(): HttpResponse {
  return {
    status: 200,
    body: { sessions: [], next_cursor: null, has_more: false, page_size: 100 },
  };
}

function sessionSummary(campaignId: string, sessionId = SESSION_ID): Record<string, unknown> {
  return {
    id: sessionId,
    campaign_id: campaignId,
    session_number: 1,
    title: 'Through the Silver Door',
    recorded_at: '2026-08-15T19:00:00Z',
    ready_at: '2026-08-16T10:00:00Z',
    artifact_created_at: '2026-08-16T10:00:00Z',
    source_url: `https://recapraven.com/recaps/${sessionId}`,
  };
}
