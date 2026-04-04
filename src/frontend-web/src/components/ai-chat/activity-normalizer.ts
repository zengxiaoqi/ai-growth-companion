import type { ActivityData, ActivityType } from '@/types';

function toSafeInt(value: any, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function normalizeActivityData(activityType: ActivityType, rawData: any): ActivityData {
  const base: ActivityData = {
    ...(rawData && typeof rawData === 'object' ? rawData : {}),
    type: activityType,
    title: typeof rawData?.title === 'string' ? rawData.title : '互动练习',
  };

  if (activityType === 'quiz') {
    const rawQuestions = Array.isArray(rawData?.questions) ? rawData.questions : [];
    const questions = rawQuestions
      .map((q: any) => {
        const options = Array.isArray(q?.options)
          ? q.options.map((opt: any) => String(opt ?? '').trim()).filter((opt: string) => !!opt)
          : [];
        if (!q?.question || options.length < 2) return null;

        let correctIndex = toSafeInt(q?.correctIndex, 0);
        if (correctIndex < 0 || correctIndex >= options.length) {
          const oneBased = correctIndex - 1;
          correctIndex = oneBased >= 0 && oneBased < options.length ? oneBased : 0;
        }

        return {
          ...q,
          question: String(q.question).trim(),
          options,
          correctIndex,
        };
      })
      .filter((q: any) => !!q);

    return {
      ...base,
      questions,
    };
  }

  return base;
}

