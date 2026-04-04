import {
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Trophy, ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ChartDataPoint {
  name: string;
  time: number;
}

interface RecentMasteredItem {
  label: string;
  color: string;
}

interface GrowthReportSectionProps {
  chartData: ChartDataPoint[];
  totalScore: number;
  recentMastered: RecentMasteredItem[];
  onViewFullReport: () => void;
}

function SkeletonCard() {
  return (
    <div className="panel-card p-8 animate-shimmer">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="mb-2 h-7 w-28 rounded bg-surface-container" />
          <div className="h-4 w-36 rounded bg-surface-container" />
        </div>
        <div className="h-6 w-14 rounded-full bg-surface-container" />
      </div>
      <div className="mt-4 h-64 rounded-xl bg-surface-container" />
      <div className="mt-6 h-12 rounded-xl bg-surface-container" />
    </div>
  );
}

export { SkeletonCard as GrowthReportSkeleton };

export default function GrowthReportSection({
  chartData,
  totalScore,
  recentMastered,
  onViewFullReport,
}: GrowthReportSectionProps) {
  return (
    <section aria-label="成长报告">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        <div className="panel-card md:col-span-8 p-5 md:p-7">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-black text-on-surface">成长报告</h2>
              <p className="text-sm text-on-surface-variant">本周学习时长统计</p>
            </div>
            <span className="rounded-full bg-secondary-container px-3 py-1 text-xs font-bold text-on-secondary-container">近7天</span>
          </div>

          <div className="h-64" role="img" aria-label={`本周学习时长柱状图，共${chartData.length}天数据`}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#81783d', fontSize: 12, fontWeight: 700 }}
                  />
                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="time" radius={[8, 8, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.time === Math.max(...chartData.map((d) => d.time)) ? '#006384' : '#f8e999'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-on-surface-variant">
                <p>暂无学习数据</p>
              </div>
            )}
          </div>

          <button
            onClick={onViewFullReport}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-on-secondary-container px-6 py-3 font-bold text-white transition-all hover:brightness-110"
          >
            查看完整学习报告
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>

        <div className="md:col-span-4 flex flex-col gap-4">
          <div className="panel-card-strong flex-1 overflow-hidden bg-on-secondary-container p-6 text-on-secondary">
            <h3 className="text-sm font-bold opacity-80">累计成长积分</h3>
            <p className="mt-2 text-4xl font-black">
              {totalScore.toLocaleString()}
              <span className="ml-2 text-lg font-semibold opacity-60">分</span>
            </p>
            <div className="mt-6 flex items-center gap-2 text-sm font-bold">
              <Trophy className="h-5 w-5 text-primary-container" />
              持续学习可解锁更多成就
            </div>
          </div>

          <div className="panel-card flex-1 p-6">
            <h3 className="text-lg font-black text-on-surface">最近掌握</h3>
            <div className="mt-4 space-y-2.5">
              {recentMastered.length > 0 ? recentMastered.map((item, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className={cn('h-2 w-2 rounded-full', item.color)} />
                  <span className="text-sm font-medium text-on-surface">{item.label}</span>
                </div>
              )) : (
                <p className="text-sm text-on-surface-variant">暂无数据</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
