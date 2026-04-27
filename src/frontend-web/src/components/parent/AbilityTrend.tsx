import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { motion } from 'motion/react';
import { ALL_DOMAINS, DOMAIN_CONFIG } from './constants';
import { EmptyState } from '../ui';

interface TrendDataPoint {
  week: string;
  language: number;
  math: number;
  science: number;
  art: number;
  social: number;
}

interface AbilityTrendProps {
  trendData: TrendDataPoint[];
}

function getTrendValue(point: TrendDataPoint, domain: string): number {
  return Number(((point as unknown as Record<string, unknown>)[domain] ?? 0));
}

function formatPercent(value: unknown): string {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return '0%';
  return `${percent}%`;
}

export default function AbilityTrend({ trendData }: AbilityTrendProps) {
  const chartDescription =
    trendData.length > 0
      ? `共 ${trendData.length} 周数据，最近一周：${ALL_DOMAINS.map((domain) => `${DOMAIN_CONFIG[domain].label} ${getTrendValue(trendData[trendData.length - 1], domain)}%`).join('，')}`
      : '暂无数据';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.1 }}
      className="panel-card p-5 md:p-6"
    >
      <div className="mb-5">
        <h2 className="text-xl font-black text-on-surface">能力趋势</h2>
        <p className="mt-1 text-sm text-on-surface-variant">近六周各领域能力变化曲线</p>
      </div>

      <div className="h-80" role="img" aria-label={`能力趋势折线图：${chartDescription}`}>
        {trendData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline-variant)" strokeOpacity={0.2} />
              <XAxis
                dataKey="week"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--color-outline)', fontSize: 12, fontWeight: 600 }}
              />
              <YAxis
                domain={[0, 100]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--color-outline)', fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '0.9rem',
                  border: '1px solid rgba(129,120,61,0.15)',
                  boxShadow: '0 6px 18px rgba(70,54,0,0.12)',
                }}
                formatter={(value) => [formatPercent(value), '能力值']}
              />
              <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600 }} />

              {ALL_DOMAINS.map((domain) => {
                const config = DOMAIN_CONFIG[domain];
                return (
                  <Line
                    key={domain}
                    type="monotone"
                    dataKey={domain}
                    name={config.label}
                    stroke={config.chartColor}
                    strokeWidth={2.4}
                    dot={{ r: 3, fill: config.chartColor }}
                    activeDot={{ r: 5 }}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState title="暂无趋势数据" description="连续学习 1 周后会出现能力变化曲线。" />
        )}
      </div>
    </motion.div>
  );
}
