import { ArrowRight, Sparkles } from '@/icons';
import { Button, Card } from '../ui';

interface AIInsightsPanelProps {
  insights: string[];
  childName: string;
  onAdjustPlan: () => void;
}

export default function AIInsightsPanel({ insights, childName, onAdjustPlan }: AIInsightsPanelProps) {
  const primaryInsight = insights[0] || `${childName}本周保持了稳定的学习节奏。`;
  const extraInsights = insights.slice(1, 3);

  return (
    <Card className="relative overflow-hidden p-5 md:p-6">
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-secondary-container/30 blur-2xl" />
      <div className="relative z-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-on-tertiary-container px-3 py-1 text-[11px] font-black uppercase tracking-wide text-white">
          <Sparkles className="h-3.5 w-3.5" />
          AI 洞察
        </span>

        <h3 className="mt-4 text-2xl font-black leading-tight text-on-surface">{primaryInsight}</h3>

        {extraInsights.length > 0 ? (
          <ul className="mt-3 space-y-1.5 text-sm text-on-surface-variant">
            {extraInsights.map((item, index) => (
              <li key={index}>• {item}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-on-surface-variant">
            持续陪伴学习并及时复盘，可以更快看到能力提升趋势。
          </p>
        )}

        <div className="mt-5">
          <Button size="md" variant="secondary" onClick={onAdjustPlan}>
            调整学习计划
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
