import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuizGame from '@/components/games/QuizGame';
import type { ActivityData, ActivityResult } from '@/types';

vi.mock('@/hooks/useGameVoice', () => ({
  useGameVoice: () => ({
    speak: vi.fn(),
    stop: vi.fn(),
  }),
}));

describe('QuizGame scoring guardrails', () => {
  it('scores correctly when correctIndex is 1-based string', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn<(result: ActivityResult) => void>();

    const data: ActivityData = {
      type: 'quiz',
      title: 'Index Normalize',
      questions: [
        {
          question: 'Pick the third option',
          options: ['opt-a', 'opt-b', 'opt-c'],
          correctIndex: '3',
          explanation: 'third',
        },
      ],
    };

    render(<QuizGame data={data} onComplete={onComplete} />);

    await user.click(screen.getByRole('button', { name: /opt-c/i }));

    // Confirm answer
    let buttons = screen.getAllByRole('button');
    await user.click(buttons[buttons.length - 1]);

    // Go to result screen
    buttons = screen.getAllByRole('button');
    await user.click(buttons[buttons.length - 1]);

    // Dismiss completion screen, triggers onComplete
    buttons = screen.getAllByRole('button');
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const result = onComplete.mock.calls[0][0];

    expect(result.totalQuestions).toBe(1);
    expect(result.correctAnswers).toBe(1);
    expect(result.score).toBe(1);
    expect(result.interactionData.reviewData?.[0]?.isCorrect).toBe(true);
    expect(result.interactionData.reviewData?.[0]?.correctAnswer).toBe('opt-c');
  });
});

