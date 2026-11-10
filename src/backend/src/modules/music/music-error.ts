/**
 * Internal music module error. `code` and `detail` must be safe to log:
 * never carry upstream URLs, query text, tokens, or credentials.
 */
export class MusicError extends Error {
  constructor(
    public readonly code: string,
    public readonly detail = '',
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'MusicError';
  }
}