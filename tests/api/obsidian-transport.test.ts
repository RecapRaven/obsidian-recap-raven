import { describe, expect, it } from 'vitest';
import { obsidianRequestTransport } from '../../src/api/obsidian-transport';
import { requestUrl } from '../mocks/obsidian';

describe('obsidianRequestTransport', () => {
  it('uses requestUrl without changing the fixed client request', async () => {
    requestUrl.mockResolvedValue({ status: 200, json: { campaign: 'safe' } });
    const request = {
      url: 'https://api.recapraven.com/v1/integrations/obsidian/connection',
      method: 'GET' as const,
      headers: { Accept: 'application/json', Authorization: 'Bearer raven_obs_test' },
    };

    await expect(obsidianRequestTransport(request)).resolves.toEqual({
      status: 200,
      body: { campaign: 'safe' },
    });
    expect(requestUrl).toHaveBeenCalledWith({ ...request, throw: false });
  });
});
