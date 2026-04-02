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
    <div className="bg-surface-container-lowest rounded-2xl p-8 border border-outline-variant/15 shadow-sm animate-pulse">
      <div className="flex justify-between items-start mb-8">
        <div>
          <div className="h-7 w-28 bg-surface-container rounded mb-2" />
          <div className="h-4 w-36 bg-surface-container rounded" />
        </div>
        <div className="h-6 w-14 bg-surface-container rounded-full" />
      </div>
      <div className="h-64 mt-4 bg-surface-container rounded-xl" />
      <div className="mt-6 h-12 bg-surface-container rounded-xl" />
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
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Main Growth Chart */}
        <div className="md:col-span-8 bg-surface-container-lowest rounded-2xl p-8 border border-outline-variant/15 shadow-sm">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-2xl font-bold text-on-secondary-container">成长报告</h2>
              <p className="text-on-surface-variant">本周学习时长统计</p>
            </div>
            <span className="px-3 py-1 bg-secondary-container text-on-secondary-container text-xs font-bold rounded-full">近7天</span>
          </div>

          <div
            className="h-64 mt-4"
            role="img"
            aria-label={`本周学习时长柱状图，共${chartData.length}天数据`}
          >
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
                      <Cell key={`cell-${index}`} fill={entry.time === Math.max(...chartData.map(d => d.time)) ? '#006384' : '#f8e999'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-on-surface-variant">
                <p>暂无学习数据</p>
              </div>
            )}
          </div>

          {/* View Full Report Button */}
          <button
            onClick={onViewFullReport}
            className="mt-6 w-full bg-on-secondary-container text-white px-6 py-3 rounded-xl font-bold hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
          >
            查看完整学习报告
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>

        {/* Achievement Summary */}
        <div className="md:col-span-4 flex flex-col gap-6">
          <div className="flex-1 bg-on-secondary-container text-on-secondary rounded-2xl p-6 relative overflow-hidden">
            <div className="relative z-10">
              <h3 className="text-lg font-bold opacity-80">总学习成就</h3>
              <p className="text-5xl font-black mt-2">{totalScore.toLocaleString()} <span className="text-lg font-medium opacity-60">积分</span></p>
              <div className="mt-8 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-primary-container" />
                <span className="text-sm font-bold">继续加油，超越自我！</span>
              </div>
            </div>
            <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-primary-container/20 rounded-full blur-2xl"></div>
          </div>

          <div className="flex-1 bg-surface-container-low rounded-2xl p-6 border border-outline-variant/10">
            <h3 className="text-lg font-bold">最近掌握</h3>
            <div className="mt-4 space-y-3">
              {recentMastered.length > 0 ? recentMastered.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={cn("w-2 h-2 rounded-full", item.color)}></div>
                  <span className="text-sm font-medium">{item.label}</span>
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
