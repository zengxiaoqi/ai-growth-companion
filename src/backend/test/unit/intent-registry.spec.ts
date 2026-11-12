import {
  INTENT_CATALOG,
  INTENT_SLOT_BINDINGS,
  intentTools,
} from '../../src/agent-framework/intent/intent-registry';
import { INTENT_KINDS } from '../../src/agent-framework/intent/intent.types';

/**
 * The tool names actually registered by @RegisterTool() across tools/impl.
 * Kept as a fixture so the catalog can never reference a tool that does not
 * exist (a typo would silently gate every turn of that intent to nothing).
 */
const KNOWN_REGISTERED_TOOLS = new Set([
  'generateBentoDocument',
  'viewReport',
  'generateActivity',
  'loadSkill',
  'viewAbilities',
  'renderRemotion',
  'translate',
  'updateEnglishLevel',
  'renderHyperframes',
  'getUserProfile',
  'listChildren',
  'enqueueTeachingVideo',
  'recordLearning',
  'getRecommendations',
  'assignActivity',
  'readFile',
  'writeFile',
  'playStory',
  'getParentControl',
  'executeCommand',
  'generateVideoContent',
  'generateCoursePack',
  'generateVideoData',
  'reviewVideoQuality',
  'searchContent',
  'listAssignments',
  'updateParentControl',
  'getAbilities',
  'playMusic',
  'getLearningHistory',
  'generateQuiz',
]);

describe('INTENT_CATALOG', () => {
  it('has an entry for every IntentKind', () => {
    for (const kind of INTENT_KINDS) {
      expect(INTENT_CATALOG[kind]).toBeDefined();
      expect(typeof INTENT_CATALOG[kind].label).toBe('string');
    }
  });

  it('references only tools that are actually registered', () => {
    for (const kind of INTENT_KINDS) {
      const tools = INTENT_CATALOG[kind].tools;
      if (tools === null) continue;
      for (const tool of tools) {
        expect(KNOWN_REGISTERED_TOOLS.has(tool)).toBe(true);
      }
    }
  });

  it('plain_chat offers no tools and open is ungated (null)', () => {
    expect(INTENT_CATALOG.plain_chat.tools).toEqual([]);
    expect(INTENT_CATALOG.open.tools).toBeNull();
  });

  it('has no duplicate tool names within an intent', () => {
    for (const kind of INTENT_KINDS) {
      const tools = INTENT_CATALOG[kind].tools;
      if (!tools) continue;
      expect(new Set(tools).size).toBe(tools.length);
    }
  });

  it('keeps loadSkill in every intent that declares skills', () => {
    for (const kind of INTENT_KINDS) {
      const d = INTENT_CATALOG[kind];
      if (d.skills && d.skills.length > 0) {
        expect(d.tools).toContain('loadSkill');
      }
    }
  });

  it('intentTools mirrors the catalog', () => {
    expect(intentTools('play_music')).toEqual(['playMusic']);
    expect(intentTools('plain_chat')).toEqual([]);
    expect(intentTools('open')).toBeNull();
  });
});

describe('INTENT_SLOT_BINDINGS', () => {
  it('binds only tools that exist and slots the catalog declares', () => {
    for (const [tool, binding] of Object.entries(INTENT_SLOT_BINDINGS)) {
      expect(KNOWN_REGISTERED_TOOLS.has(tool)).toBe(true);
      const owningIntent = INTENT_KINDS.find((k) => INTENT_CATALOG[k].tools?.includes(tool));
      expect(owningIntent).toBeDefined();
      expect(INTENT_CATALOG[owningIntent!].slot).toBe(binding.slot);
    }
  });

  it('binds the three card tools verbatim', () => {
    expect(INTENT_SLOT_BINDINGS.playMusic).toEqual({ arg: 'query', slot: 'song_title' });
    expect(INTENT_SLOT_BINDINGS.playStory).toEqual({ arg: 'topic', slot: 'topic' });
    expect(INTENT_SLOT_BINDINGS.translate).toEqual({ arg: 'text', slot: 'text' });
  });
});