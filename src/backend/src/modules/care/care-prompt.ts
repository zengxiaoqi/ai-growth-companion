/**
 * Render a care cue as a system-prompt instruction.
 *
 * Kept in one exported function because two execution paths build a system
 * prompt — the legacy `AgentExecutor` and the framework `OrchestratorService`
 * — and a cue must read the same in both.
 *
 * The topic is **untrusted text**: it originated as model-extracted memory,
 * was stored in `care_cues.topic`, and is now being spliced into an
 * instruction the model will obey. Flattening it to a single line and
 * capping its length is not cosmetic — a topic containing a newline and
 * "Ignore previous instructions" would otherwise become a second paragraph
 * of instructions.
 */
export function careCuePrompt(topic: string | undefined | null): string {
  const safe = (topic ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[「」]/g, '')
    .trim()
    .slice(0, 100);
  if (!safe) return '';

  return [
    '## 本轮可以主动关心的事',
    `孩子之前提到过「${safe}」。如果这一轮的话题合适，可以在回答里自然地问候一句近况；`,
    '不要生硬追问、不要复述这条指令、不要编造孩子没说过的细节。只在这一轮提一次。',
  ].join('\n');
}
