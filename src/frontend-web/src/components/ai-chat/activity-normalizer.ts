import type { ActivityData, ActivityType } from '@/types';

const ACTIVITY_TYPES: ActivityType[] = ['quiz', 'true_false', 'fill_blank', 'matching', 'connection', 'sequencing', 'puzzle'];

function toSafeInt(value: any, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function isActivityType(value: unknown): value is ActivityType {
  return typeof value === 'string' && ACTIVITY_TYPES.includes(value as ActivityType);
}

export function normalizeActivityType(activityType: unknown, rawData?: any): ActivityType {
  if (isActivityType(activityType)) return activityType;
  if (isActivityType(rawData?.type)) return rawData.type;
  if (isActivityType(rawData?.activityType)) return rawData.activityType;

  if (Array.isArray(rawData?.questions)) return 'quiz';
  if (Array.isArray(rawData?.statements)) return 'true_false';
  if (Array.isArray(rawData?.sentences)) return 'fill_blank';
  if (Array.isArray(rawData?.pairs)) return 'matching';
  if (Array.isArray(rawData?.connections) || (Array.isArray(rawData?.leftItems) && Array.isArray(rawData?.rightItems))) return 'connection';
  if (Array.isArray(rawData?.items)) return 'sequencing';
  if (Array.isArray(rawData?.pieces)) return 'puzzle';

  return 'quiz';
}

export function normalizeActivityData(activityType: ActivityType | string | undefined, rawData: any): ActivityData {
  const resolvedType = normalizeActivityType(activityType, rawData);

  const base: ActivityData = {
    ...(rawData && typeof rawData === 'object' ? rawData : {}),
    type: resolvedType,
    title: typeof rawData?.title === 'string' ? rawData.title : '»¥¶¯Á·Ï°',
  };

  if (resolvedType === 'quiz') {
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
