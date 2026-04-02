import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { motion } from 'motion/react';
import { DOMAIN_CONFIG, RADAR_COLORS, ALL_DOMAINS } from './constants';

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

export default function AbilityTrend({ trendData }: AbilityTrendProps) {
  // Build description for screen readers
  const chartDescription = trendData.length > 0
    ? `共${trendData.length}周数据，最新一周：${ALL_DOMAINS.map(d => `${DOMAIN_CONFIG[d].label} ${trendData[trendData.length - 1][d as keyof TrendDataPoint]}%`).join('，')}`
    : '暂无数据';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="md:col-span-7 bg-surface-container-lowest rounded-2xl p-8 border border-outline-variant/15 shadow-sm"
    >
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-on-secondary-container">能力趋势</h2>
        <p className="text-on-surface-variant text-sm mt-1">近六周各领域能力变化</p>
      </div>

      <div
        className="h-80"
        role="img"
        aria-label={`能力趋势折线图：${chartDescription}`}
      >
        {trendData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#b9ae6e" strokeOpacity={0.2} />
              <XAxis
                dataKey="week"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#81783d', fontSize: 12, fontWeight: 600 }}
              />
              <YAxis
                domain={[0, 100]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#81783d', fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              />
              <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600 }} />
              {ALL_DOMAINS.map((domain, i) => {
                const config = DOMAIN_CONFIG[domain];
                return (
                  <Line
                    key={domain}
                    type="monotone"
                    dataKey={domain}
                    name={config.label}
                    stroke={RADAR_COLORS[i]}
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: RADAR_COLORS[i] }}
                    activeDot={{ r: 5 }}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-on-surface-variant">
            <p>暂无能力趋势数据</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
