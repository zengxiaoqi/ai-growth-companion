import { MusicError } from '../music-error';

const NUMBER_RE = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;

/**
 * Kuwo's r.s API returns a JS object literal, not JSON: single-quoted keys
 * and strings, unquoted numbers. A naive "replace ' with "" regex breaks
 * silently on apostrophes in song names (Don't). This recursive-descent
 * parser only accepts that small grammar and fails on anything else.
 *
 * Returns null when the response is not an object at all — the API replies
 * with `RN=1\nHit=0\n...` key=value lines when there are no results.
 */
export function parseLooseObject(text: unknown): Record<string, any> | null {
  const src = String(text == null ? '' : text);
  let pos = 0;

  const fail = (): never => {
    throw new MusicError('source_bad_payload', 'loose-json');
  };
  const skipSpace = () => {
    while (pos < src.length && /\s/.test(src[pos])) pos += 1;
  };

  function parseString(quote: string): string {
    pos += 1;
    let out = '';
    while (pos < src.length) {
      const ch = src[pos];
      if (ch === '\\') {
        const next = src[pos + 1];
        if (next === undefined) fail();
        if (next === 'n') out += '\n';
        else if (next === 't') out += '\t';
        else if (next === 'r') out += '\r';
        else if (next === 'u') {
          const hex = src.slice(pos + 2, pos + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail();
          out += String.fromCharCode(parseInt(hex, 16));
          pos += 4;
        } else out += next;
        pos += 2;
        continue;
      }
      if (ch === quote) {
        pos += 1;
        return out;
      }
      out += ch;
      pos += 1;
    }
    fail();
  }

  function parseLiteral(): any {
    const start = pos;
    while (pos < src.length && !/[,}\]\s]/.test(src[pos])) pos += 1;
    const raw = src.slice(start, pos);
    if (!raw) fail();
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw === 'null' || raw === 'undefined') return null;
    if (NUMBER_RE.test(raw)) return Number(raw);
    return raw;
  }

  function parseArray(): any[] {
    pos += 1;
    const out: any[] = [];
    skipSpace();
    if (src[pos] === ']') {
      pos += 1;
      return out;
    }
    for (;;) {
      out.push(parseValue());
      skipSpace();
      if (src[pos] === ',') {
        pos += 1;
        continue;
      }
      if (src[pos] === ']') {
        pos += 1;
        return out;
      }
      fail();
    }
  }

  function parseObject(): Record<string, any> {
    pos += 1;
    const out: Record<string, any> = Object.create(null);
    skipSpace();
    if (src[pos] === '}') {
      pos += 1;
      return out;
    }
    for (;;) {
      skipSpace();
      let key: string;
      if (src[pos] === "'" || src[pos] === '"') {
        key = parseString(src[pos]);
      } else {
        const start = pos;
        while (pos < src.length && !/[:,}\s]/.test(src[pos])) pos += 1;
        key = src.slice(start, pos).trim();
        if (!key) fail();
      }
      skipSpace();
      if (src[pos] !== ':') fail();
      pos += 1;
      out[key] = parseValue();
      skipSpace();
      if (src[pos] === ',') {
        pos += 1;
        continue;
      }
      if (src[pos] === '}') {
        pos += 1;
        return out;
      }
      fail();
    }
  }

  function parseValue(): any {
    skipSpace();
    const ch = src[pos];
    if (ch === '{') return parseObject();
    if (ch === '[') return parseArray();
    if (ch === "'" || ch === '"') return parseString(ch);
    return parseLiteral();
  }

  skipSpace();
  if (src[pos] !== '{') return null;
  const value = parseValue();
  skipSpace();
  if (pos !== src.length) fail();
  return value;
}