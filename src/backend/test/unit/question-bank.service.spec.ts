import { FindOperator } from 'typeorm';
import { QuestionBankService } from '../../src/modules/game/question-bank.service';
import { computeQuestionHash } from '../../src/common/activity/question-hash';

/** In-memory Repository<QuestionItem> stand-in honoring equality + In() filters. */
function makeFakeRepo() {
  const rows: any[] = [];
  let nextId = 1;
  const matches = (row: any, where: any) =>
    Object.entries(where).every(([key, value]) => {
      if (value instanceof FindOperator && value.type === 'in') {
        return (value.value as any[]).includes(row[key]);
      }
      return row[key] === value;
    });
  return {
    rows,
    find: jest.fn(async ({ where }: any) => rows.filter((r) => matches(r, where)).map((r) => ({ ...r }))),
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn(async (row: any) => {
      if (row.id == null) {
        row.id = nextId++;
        // Emulate the column defaults the database applies on INSERT.
        row.timesServed ??= 0;
        row.timesCorrect ??= 0;
        row.qualityScore ??= 100;
        row.status ??= 'active';
        row.source ??= 'llm';
        row.difficulty ??= 1;
        rows.push(row);
      } else {
        const i = rows.findIndex((r) => r.id === row.id);
        if (i >= 0) rows[i] = row;
        else rows.push(row);
      }
      return row;
    }),
    update: jest.fn(async (where: any, patch: any) => {
      rows.filter((r) => matches(r, where)).forEach((r) => Object.assign(r, patch));
    }),
  };
}

function quizActivity(questions: Array<{ question: string; options: string[]; correctIndex: number }>) {
  return {
    type: 'quiz',
    topic: '动物',
    ageGroup: '5-6',
    domain: 'science',
    difficulty: 2,
    questions,
  };
}

const Q1 = { question: '猫有几条腿？', options: ['2', '4', '6'], correctIndex: 1 };
const Q2 = { question: '牛吃什么？', options: ['草', '肉', '鱼'], correctIndex: 0 };
const Q3 = { question: '鸟会飞吗？', options: ['会', '不会', '不确定'], correctIndex: 0 };

describe('QuestionBankService', () => {
  let repo: ReturnType<typeof makeFakeRepo>;
  let service: QuestionBankService;

  beforeEach(() => {
    repo = makeFakeRepo();
    service = new QuestionBankService(repo as any);
  });

  describe('ingest', () => {
    it('deposits one row per question with metadata', async () => {
      await service.ingest(quizActivity([Q1, Q2]), 'llm');
      expect(repo.rows).toHaveLength(2);
      expect(repo.rows[0]).toMatchObject({
        topic: '动物',
        ageGroup: '5-6',
        domain: 'science',
        difficulty: 2,
        activityType: 'quiz',
        source: 'llm',
        status: 'active',
        qualityScore: 100,
      });
    });

    it('is hash-idempotent across repeated ingests', async () => {
      await service.ingest(quizActivity([Q1, Q2]), 'llm');
      await service.ingest(quizActivity([Q2, Q1, Q3]), 'llm');
      expect(repo.rows).toHaveLength(3);
    });

    it('ignores option order when deduping', async () => {
      const shuffled = { ...Q1, options: ['6', '2', '4'], correctIndex: 2 };
      await service.ingest(quizActivity([Q1]), 'llm');
      await service.ingest(quizActivity([shuffled]), 'llm');
      expect(repo.rows).toHaveLength(1);
    });

    it('stores a group activity as a single row', async () => {
      await service.ingest({
        type: 'matching',
        topic: '动物',
        ageGroup: '5-6',
        pairs: [{ id: 'p1', left: '牛', right: '牛奶' }],
      });
      expect(repo.rows).toHaveLength(1);
      expect(repo.rows[0].activityType).toBe('matching');
    });
  });

  describe('select', () => {
    beforeEach(async () => {
      await service.ingest(quizActivity([Q1, Q2, Q3]), 'llm');
    });

    it('serves the requested count with servedQuestionIds', async () => {
      const activity = await service.select({
        topic: '动物',
        ageGroup: '5-6',
        type: 'quiz',
        difficulty: 2,
        childId: 1,
        count: 2,
      });
      expect(activity.questions).toHaveLength(2);
      expect(activity.servedQuestionIds).toHaveLength(2);
      expect(activity.type).toBe('quiz');
    });

    it('returns null on shortfall', async () => {
      const activity = await service.select({
        topic: '动物',
        ageGroup: '5-6',
        type: 'quiz',
        difficulty: 2,
        childId: 1,
        count: 5,
      });
      expect(activity).toBeNull();
    });

    it('excludes the child recently served questions', async () => {
      const first = await service.select({
        topic: '动物',
        ageGroup: '5-6',
        type: 'quiz',
        difficulty: 2,
        childId: 1,
        count: 3,
      });
      expect(first.questions).toHaveLength(3);
      // All three are now recent for child 1 → nothing left to serve.
      const second = await service.select({
        topic: '动物',
        ageGroup: '5-6',
        type: 'quiz',
        difficulty: 2,
        childId: 1,
        count: 1,
      });
      expect(second).toBeNull();
      // A different child still gets the full pool.
      const other = await service.select({
        topic: '动物',
        ageGroup: '5-6',
        type: 'quiz',
        difficulty: 2,
        childId: 2,
        count: 3,
      });
      expect(other.questions).toHaveLength(3);
    });

    it('prefers least-served questions', async () => {
      const h1 = computeQuestionHash('quiz', Q1);
      const target = repo.rows.find((r) => r.questionHash === h1);
      target.timesServed = 100; // far above jitter range → never picked first
      const activity = await service.select({
        topic: '动物',
        ageGroup: '5-6',
        type: 'quiz',
        difficulty: 2,
        childId: 1,
        count: 1,
      });
      expect(activity.servedQuestionIds[0]).not.toBe(h1);
    });

    it('shuffles options but keeps correctIndex pointing at the right answer', async () => {
      const activity = await service.select({
        topic: '动物',
        ageGroup: '5-6',
        type: 'quiz',
        difficulty: 2,
        childId: 1,
        count: 3,
      });
      for (const q of activity.questions) {
        const original = [Q1, Q2, Q3].find((src) => src.question === q.question)!;
        expect(q.options[q.correctIndex]).toBe(original.options[original.correctIndex]);
        expect([...q.options].sort()).toEqual([...original.options].sort());
      }
    });

    it('updates lastServedAt without bumping timesServed', async () => {
      await service.select({
        topic: '动物',
        ageGroup: '5-6',
        type: 'quiz',
        difficulty: 2,
        childId: 1,
        count: 1,
      });
      expect(repo.update).toHaveBeenCalled();
      expect(repo.rows.every((r) => r.timesServed === 0)).toBe(true);
    });
  });

  describe('recordResults', () => {
    it('increments serving and correct counters', async () => {
      await service.ingest(quizActivity([Q1]), 'llm');
      await service.recordResults(1, quizActivity([Q1]), { interactionData: { answers: [1] } });
      expect(repo.rows[0].timesServed).toBe(1);
      expect(repo.rows[0].timesCorrect).toBe(1);
      await service.recordResults(1, quizActivity([Q1]), { interactionData: { answers: [0] } });
      expect(repo.rows[0].timesServed).toBe(2);
      expect(repo.rows[0].timesCorrect).toBe(1);
    });

    it('flags a question that is too hard after 10 samples', async () => {
      await service.ingest(quizActivity([Q1]), 'llm');
      for (let i = 0; i < 10; i += 1) {
        await service.recordResults(1, quizActivity([Q1]), { interactionData: { answers: [0] } });
      }
      expect(repo.rows[0].status).toBe('flagged');
      expect(repo.rows[0].qualityScore).toBe(0);
    });

    it('flags a question that is trivially easy after 10 samples', async () => {
      await service.ingest(quizActivity([Q1]), 'llm');
      for (let i = 0; i < 10; i += 1) {
        await service.recordResults(1, quizActivity([Q1]), { interactionData: { answers: [1] } });
      }
      expect(repo.rows[0].status).toBe('flagged');
      expect(repo.rows[0].qualityScore).toBe(100);
    });

    it('keeps a balanced question active', async () => {
      await service.ingest(quizActivity([Q1]), 'llm');
      for (let i = 0; i < 10; i += 1) {
        const answer = i < 5 ? 1 : 0; // 50% accuracy
        await service.recordResults(1, quizActivity([Q1]), { interactionData: { answers: [answer] } });
      }
      expect(repo.rows[0].status).toBe('active');
    });

    it('does not flag before the sample threshold', async () => {
      await service.ingest(quizActivity([Q1]), 'llm');
      for (let i = 0; i < 9; i += 1) {
        await service.recordResults(1, quizActivity([Q1]), { interactionData: { answers: [0] } });
      }
      expect(repo.rows[0].status).toBe('active');
    });

    it('is a no-op when result has no answer data', async () => {
      await service.ingest(quizActivity([Q1]), 'llm');
      await service.recordResults(1, quizActivity([Q1]), { score: 1 });
      expect(repo.rows[0].timesServed).toBe(0);
    });
  });
});