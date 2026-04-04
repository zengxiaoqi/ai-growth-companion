import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import { ArrowRight, Trophy } from '@/icons';
import { Button, Card, EmptyState } from '../ui';

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

function formatMinutes(value: unknown): string {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return '0 分钟';
  return `${minutes} 分钟`;
}

function SkeletonCard() {
  return (
    <Card className="animate-shimmer p-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="mb-2 h-7 w-32 rounded bg-surface-container" />
          <div className="h-4 w-36 rounded bg-surface-container" />
        </div>
        <div className="h-6 w-14 rounded-full bg-surface-container" />
      </div>
      <div className="mt-4 h-64 rounded-xl bg-surface-container" />
      <div className="mt-6 h-12 rounded-xl bg-surface-container" />
    </Card>
  );
}

export { SkeletonCard as GrowthReportSkeleton };

export default function GrowthReportSection({
  chartData,
  totalScore,
  recentMastered,
  onViewFullReport,
}: GrowthReportSectionProps) {
  const maxTime = chartData.length > 0 ? Math.max(...chartData.map((item) => item.time)) : 0;

  return (
    <section aria-label="成长报告概览" className="grid grid-cols-1 gap-4 md:grid-cols-12">
      <Card className="p-5 md:col-span-8 md:p-7">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-on-surface">成长报告</h2>
            <p className="text-sm text-on-surface-variant">近 7 天学习时长变化</p>
          </div>
          <span className="rounded-full bg-secondary-container px-3 py-1 text-xs font-black text-on-secondary-container">近 7 天</span>
        </div>

        <div className="h-64" role="img" aria-label={`近7天学习时长图，共 ${chartData.length} 天数据`}>
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
                  cursor={{ fill: 'rgba(112, 89, 0, 0.08)' }}
                  contentStyle={{
                    borderRadius: '0.9rem',
                    border: '1px solid rgba(129,120,61,0.15)',
                    boxShadow: '0 6px 18px rgba(70,54,0,0.12)',
                  }}
                  formatter={(value) => [formatMinutes(value), '学习时长']}
                />
                <Bar dataKey="time" radius={[8, 8, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.time === maxTime ? '#006384' : '#f8e999'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              title="暂无学习数据"
              description="孩子开始学习后，这里会自动生成最近一周趋势。"
            />
          )}
        </div>

        <Button onClick={onViewFullReport} className="mt-5 w-full" size="lg" variant="secondary">
          查看完整学习报告
          <ArrowRight className="h-5 w-5" />
        </Button>
      </Card>

      <div className="flex flex-col gap-4 md:col-span-4">
        <Card className="panel-card-strong flex-1 overflow-hidden bg-on-secondary-container p-6 text-on-secondary">
          <h3 className="text-sm font-bold opacity-80">累计成长积分</h3>
          <p className="mt-2 text-4xl font-black">
            {totalScore.toLocaleString()}
            <span className="ml-2 text-lg font-semibold opacity-70">分</span>
          </p>
          <div className="mt-6 flex items-center gap-2 text-sm font-bold">
            <Trophy className="h-5 w-5 text-primary-container" />
            持续学习可解锁更多成就
          </div>
        </Card>

        <Card className="flex-1 p-6">
          <h3 className="text-lg font-black text-on-surface">最近掌握</h3>
          <div className="mt-4 space-y-2.5">
            {recentMastered.length > 0 ? (
              recentMastered.map((item, index) => (
                <div key={index} className="flex items-center gap-2.5">
                  <div className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
                  <span className="text-sm font-semibold text-on-surface">{item.label}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-on-surface-variant">暂无已掌握内容</p>
            )}
          </div>
        </Card>
      </div>
    </section>
  );
}
