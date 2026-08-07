import {
  extractJsonObject,
  extractJsonArray,
  containsJson,
} from '../../src/agent-framework/core/utils/json-extraction';

/**
 * Unit tests for json-extraction.ts — pure-function utilities
 * that extract and parse JSON from raw LLM text using multiple strategies.
 */
describe('extractJsonObject', () => {
  describe('Strategy 1: direct parse', () => {
    it('parses a simple JSON object string', () => {
      const input = '{"name": "Alice", "age": 30}';
      expect(extractJsonObject(input)).toEqual({ name: 'Alice', age: 30 });
    });

    it('parses a nested JSON object', () => {
      const input = '{"user": {"id": 1, "role": "admin"}, "active": true}';
      const result = extractJsonObject(input);
      expect(result).toEqual({ user: { id: 1, role: 'admin' }, active: true });
    });

    it('returns null when parsing a JSON array directly', () => {
      // Arrays should NOT be returned as objects
      expect(extractJsonObject('[1, 2, 3]')).toBeNull();
    });
  });

  describe('Strategy 2: ```json code block', () => {
    it('extracts from a fenced json block', () => {
      const input = 'Here is your answer:\n```json\n{"key": "value"}\n```\nDone.';
      expect(extractJsonObject(input)).toEqual({ key: 'value' });
    });

    it('handles extra whitespace inside the json block', () => {
      const input = '```json\n  {  "spaced": true  }\n```\n';
      expect(extractJsonObject(input)).toEqual({ spaced: true });
    });
  });

  describe('Strategy 3: generic ``` code block', () => {
    it('extracts from a code block without language tag', () => {
      const input = 'Some explanation\n```\n{"data": [1, 2, 3]}\n```\nEnd.';
      expect(extractJsonObject(input)).toEqual({ data: [1, 2, 3] });
    });

    it('prefers ```json over generic ``` when both present', () => {
      // The json block is tried first, so its content should win
      const input = '```json\n{"favored": true}\n```\n```\n{"not_favored": true}\n```';
      expect(extractJsonObject(input)).toEqual({ favored: true });
    });
  });

  describe('Strategy 4: brace slice', () => {
    it('extracts by finding outermost braces in mixed text', () => {
      const input = 'Here are the results: {"result": "success", "count": 5}.\nThat\'s all.';
      expect(extractJsonObject(input)).toEqual({ result: 'success', count: 5 });
    });

    it('handles text before and after the JSON with surrounding prose', () => {
      const input =
        'Sure! Here you go:\n\n{\n  "title": "Hello World",\n  "body": "test"\n}\n\nHope that helps!';
      expect(extractJsonObject(input)).toEqual({ title: 'Hello World', body: 'test' });
    });
  });

  describe('Edge cases', () => {
    it('returns null for empty string', () => {
      expect(extractJsonObject('')).toBeNull();
    });

    it('returns null for null/undefined input', () => {
      expect(extractJsonObject(null as any)).toBeNull();
      expect(extractJsonObject(undefined as any)).toBeNull();
    });

    it('returns null for invalid JSON anywhere', () => {
      expect(extractJsonObject('this is not json at all')).toBeNull();
    });

    it('trims the input before processing', () => {
      const input = '  {"trimmed": true}  ';
      expect(extractJsonObject(input)).toEqual({ trimmed: true });
    });
  });
});

describe('extractJsonArray', () => {
  describe('Strategy 1: direct parse', () => {
    it('parses a simple JSON array string', () => {
      const input = '[1, 2, 3]';
      expect(extractJsonArray(input)).toEqual([1, 2, 3]);
    });

    it('parses an array of strings', () => {
      const input = '["apple", "banana", "cherry"]';
      expect(extractJsonArray(input)).toEqual(['apple', 'banana', 'cherry']);
    });

    it('parses an array of objects', () => {
      const input = '[{"id": 1}, {"id": 2}]';
      expect(extractJsonArray(input)).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('does not return non-arrays (e.g. an object)', () => {
      expect(extractJsonArray('{"key": "value"}')).toBeNull();
    });
  });

  describe('Strategy 2: code block', () => {
    it('extracts from ```json code block', () => {
      const input = '```json\n[10, 20, 30]\n```';
      expect(extractJsonArray(input)).toEqual([10, 20, 30]);
    });

    it('extracts from generic ``` code block', () => {
      const input = 'Results:\n```\n[42]\n```';
      expect(extractJsonArray(input)).toEqual([42]);
    });
  });

  describe('Strategy 3: bracket slice', () => {
    it('extracts by finding outermost brackets in mixed text', () => {
      const input = 'Tags: ["react", "typescript", "jest"]. See above.';
      expect(extractJsonArray(input)).toEqual(['react', 'typescript', 'jest']);
    });

    it('handles text wrapped around array with newlines', () => {
      const input = 'List:\n[\n  "a",\n  "b",\n  "c"\n]\nEnd.';
      expect(extractJsonArray(input)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('Edge cases', () => {
    it('returns null for empty string', () => {
      expect(extractJsonArray('')).toBeNull();
    });

    it('returns null for null/undefined input', () => {
      expect(extractJsonArray(null as any)).toBeNull();
      expect(extractJsonArray(undefined as any)).toBeNull();
    });

    it('returns null for text with no valid JSON array', () => {
      expect(extractJsonArray('just plain text')).toBeNull();
    });

    it('returns null for nested arrays (which are valid JSON but still arrays)', () => {
      // Actually [[1,2],[3,4]] IS a valid array, should pass
      expect(extractJsonArray('[[1,2],[3,4]]')).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });
  });
});

describe('containsJson', () => {
  it('returns true for text containing an opening brace', () => {
    expect(containsJson('some text {more}')).toBe(true);
  });

  it('returns true for text containing an opening bracket', () => {
    expect(containsJson('some text [more]')).toBe(true);
  });

  it('returns false for text with neither { nor [', () => {
    expect(containsJson('no json here at all')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(containsJson('')).toBe(false);
  });

  it('correctly identifies text starting with JSON', () => {
    expect(containsJson('{"key":"val"}')).toBe(true);
    expect(containsJson('[1,2,3]')).toBe(true);
  });
});
