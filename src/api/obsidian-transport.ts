import { requestUrl } from 'obsidian';

import type { RequestTransport } from './recap-raven-client';

/** Production transport adapter. Business logic receives RequestTransport by injection. */
export const obsidianRequestTransport: RequestTransport = async (request) => {
  const response = await requestUrl({
    url: request.url,
    method: request.method,
    headers: { ...request.headers },
    throw: false,
  });
  let body: unknown = null;
  try {
    body = response.json;
  } catch {
    // A non-JSON error body is deliberately discarded rather than surfaced or logged.
  }
  return { status: response.status, body };
};
