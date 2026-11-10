import type { ActivityType, ActivityData, ActivityResult } from '@/types';
import QuizGame from './QuizGame';
import TrueFalseGame from './TrueFalseGame';
import FillBlankGame from './FillBlankGame';
import MatchingGame from './MatchingGame';
import ConnectionGame from './ConnectionGame';
import SequencingGame from './SequencingGame';
import PuzzleGame from './PuzzleGame';
import DragSortGame from './DragSortGame';

interface GameRendererProps {
  type: ActivityType;
  data: ActivityData;
  onComplete: (result: ActivityResult) => void;
}

/** Route to the correct game component based on activity type */
export default function GameRenderer({ type, data, onComplete }: GameRendererProps) {
  switch (type) {
    case 'quiz':
      return <QuizGame data={data} onComplete={onComplete} />;
    case 'true_false':
      return <TrueFalseGame data={data} onComplete={onComplete} />;
    case 'fill_blank':
      return <FillBlankGame data={data} onComplete={onComplete} />;
    case 'matching':
      return <MatchingGame data={data} onComplete={onComplete} />;
    case 'connection':
      return <ConnectionGame data={data} onComplete={onComplete} />;
    case 'sequencing':
      return <SequencingGame data={data} onComplete={onComplete} />;
    case 'puzzle':
      return <PuzzleGame data={data} onComplete={onComplete} />;
    case 'drag_sort':
      return <DragSortGame data={data} onComplete={onComplete} />;
    default:
      return <div className="p-4 text-on-surface-variant">暂不支持的活动类型</div>;
  }
}
