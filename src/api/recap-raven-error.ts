export type RecapRavenErrorCode =
  | 'missing-key'
  | 'invalid-key'
  | 'invalid-request'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'rate-limited'
  | 'unavailable'
  | 'unexpected-response';

export class RecapRavenError extends Error {
  public constructor(
    public readonly code: RecapRavenErrorCode,
    message: string,
    public readonly status: number | null = null,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'RecapRavenError';
  }
}
