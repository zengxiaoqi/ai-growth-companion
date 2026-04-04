import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { DOMAIN_CONFIG } from './constants';
import type { Ability } from '@/types';

interface AbilityRadarProps {
  abilities: Ability[];
  radarData: { domain: string; progress: number; fullMark: number }[];
}

export default function AbilityRadar({ abilities, radarData }: AbilityRadarProps) {
  const chartDescription = abilities
    .map((a) => {
      const config = DOMAIN_CONFIG[a.domain];
      return `${config?.label || a.domain}: Lv.${a.level}, 进度${a.progress}%`;
    })
    .join('；');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.06 }}
      className="panel-card p-5 md:p-6"
    >
      <div className="mb-5">
        <h2 className="text-xl font-black text-on-surface">五维能力评估</h2>
        <p className="mt-1 text-sm text-on-surface-variant">综合能力发展雷达图</p>
      </div>

      <div className="h-72" role="img" aria-label={`五维能力雷达图：${chartDescription}`}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
            <PolarGrid stroke="#b9ae6e" strokeOpacity={0.3} />
            <PolarAngleAxis dataKey="domain" tick={{ fill: '#655c25', fontSize: 13, fontWeight: 700 }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#81783d', fontSize: 10 }} axisLine={false} />
            <Radar
              name="能力值"
              dataKey="progress"
              stroke="#006384"
              fill="#97daff"
              fillOpacity={0.4}
              strokeWidth={2}
            />
            <Tooltip
              contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              formatter={(value: unknown) => [`${value}%`, '能力值']}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-5 space-y-3">
        {abilities.map((ability, i) => {
          const config = DOMAIN_CONFIG[ability.domain];
          if (!config) return null;
          return (
            <div key={ability.domain} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className={cn('text-sm font-bold', config.textColor)}>{config.label}</span>
                <span className="text-xs font-bold text-on-surface-variant">Lv.{ability.level} · {ability.progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-container">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${ability.progress}%` }}
                  transition={{ duration: 0.7, delay: i * 0.08, ease: 'easeOut' }}
                  className={cn('h-full rounded-full', config.color)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
