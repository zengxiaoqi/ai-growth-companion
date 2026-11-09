/**
 * Parent-side postMessage validation. Shared by the browser host page and the Node verifier.
 * P0 prototype of the validation described in docs/ohmygame-integration-plan.md section 6.6/6.7.
 */
export const CHANNEL = 'lingxi-game';
export const SESSION_TTL_MS = 5 * 60 * 1000;

export function createResultValidator({
  expectedOrigin,
  sessionId,
  bridgeHash,
  maxAgeMs = SESSION_TTL_MS,
  now = () => Date.now(),
}) {
  const state = {
    startedAt: now(),
    ready: false,
    completed: false,
    heartbeats: 0,
    lastEventAt: now(),
  };

  const reject = (reason) => ({ ok: false, reason });

  return {
    get state() {
      return { ...state };
    },

    isExpired(at = now()) {
      return at - state.startedAt > maxAgeMs;
    },

    validate(event, sourceWindow) {
      if (state.completed) return reject('session already completed');
      if (!event || event.source !== sourceWindow) return reject('source mismatch');
      if (event.origin !== expectedOrigin) return reject('origin mismatch');

      const msg = event.data;
      if (!msg || typeof msg !== 'object') return reject('bad payload');
      if (msg.channel !== CHANNEL) return reject('channel mismatch');
      if (msg.sessionId !== sessionId) return reject('session mismatch');

      state.lastEventAt = now();
      const payload = msg.payload && typeof msg.payload === 'object' ? msg.payload : {};

      switch (msg.type) {
        case 'INIT':
          return reject('unexpected INIT from child');

        case 'READY':
          if (payload.bridgeHash !== bridgeHash) return reject('bridge hash mismatch');
          state.ready = true;
          return { ok: true, type: 'READY' };

        case 'HEARTBEAT':
          state.heartbeats += 1;
          return { ok: true, type: 'HEARTBEAT' };

        case 'PROGRESS':
          return { ok: true, type: 'PROGRESS', payload };

        case 'ERROR':
          return { ok: true, type: 'ERROR', payload };

        case 'COMPLETE': {
          const total = Number(payload.totalQuestions);
          const correct = Number(payload.correctAnswers);
          if (!Number.isInteger(total) || total <= 0) return reject('invalid totalQuestions');
          if (!Number.isInteger(correct) || correct < 0 || correct > total) {
            return reject('invalid correctAnswers');
          }

          const rawScore = Number(payload.score);
          const score = Number.isFinite(rawScore)
            ? Math.min(100, Math.max(0, Math.round(rawScore)))
            : 0;
          const rawTime = Number(payload.timeSpent);
          const timeSpent = Number.isFinite(rawTime) ? Math.max(0, Math.round(rawTime)) : 0;
          const interactionData =
            payload.interactionData && typeof payload.interactionData === 'object'
              ? payload.interactionData
              : {};

          state.completed = true;
          return {
            ok: true,
            type: 'COMPLETE',
            result: { score, totalQuestions: total, correctAnswers: correct, timeSpent, interactionData },
          };
        }

        default:
          return reject('unknown message type');
      }
    },
  };
}

/** Convert a validated result into the payload expected by POST /assignments/:id/complete. */
export function toAssignmentCompletion(result, extras = {}) {
  return {
    score: result.score,
    resultData: {
      correctAnswers: result.correctAnswers,
      totalQuestions: result.totalQuestions,
      timeSpent: result.timeSpent,
      ...result.interactionData,
      ...extras,
    },
  };
}
