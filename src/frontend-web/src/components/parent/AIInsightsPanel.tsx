import { ArrowRight, Sparkles } from 'lucide-react';

interface AIInsightsPanelProps {
  insights: string[];
  childName: string;
  onAdjustPlan: () => void;
}

export default function AIInsightsPanel({ insights, childName, onAdjustPlan }: AIInsightsPanelProps) {
  return (
    <div className="bg-surface-container-low rounded-2xl p-8 flex flex-col justify-between overflow-hidden relative h-full">
      <div className="relative z-10">
        <span className="bg-on-tertiary-container text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-tighter">
          AI 智能洞察
        </span>
        <h2 className="text-3xl font-bold mt-6 text-on-secondary-container leading-tight">
          {insights.length > 0
            ? `${childName}${insights[0]}`
            : `${childName}正在不断成长中！`}
        </h2>
        <p className="mt-4 text-on-surface-variant leading-relaxed">
          {insights.length > 1
            ? insights.slice(1).join('；')
            : '继续陪伴孩子学习，会看到更多变化。'}
        </p>
        <button
          onClick={onAdjustPlan}
          className="mt-8 bg-on-secondary-container text-white px-8 py-4 rounded-xl font-bold hover:scale-105 transition-transform flex items-center gap-2"
        >
          调整学习计划
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
      <div className="absolute bottom-0 right-0 w-1/2 opacity-10">
        <Sparkles className="w-full h-48 text-on-tertiary-container" />
      </div>
    </div>
  );
}
