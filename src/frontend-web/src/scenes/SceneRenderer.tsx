import type { LessonScene } from '@/types';
import AnimationRenderer from '@/animations/renderers/AnimationRenderer';
import { cn } from '@/lib/utils';

interface SceneRendererProps {
  scene: LessonScene;
  isPlaying?: boolean;
  onSceneComplete?: () => void;
}

function backgroundClass(type?: string): string {
  switch (type) {
    case 'night':
      return 'bg-gradient-to-br from-slate-900 via-sky-950 to-slate-800 text-white';
    case 'indoor':
      return 'bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-100 text-amber-950';
    case 'seasonal':
      return 'bg-gradient-to-br from-emerald-100 via-sky-100 to-amber-100 text-slate-900';
    case 'abstract':
      return 'bg-gradient-to-br from-primary-container/40 via-tertiary-container/30 to-secondary-container/30 text-on-surface';
    case 'day':
    default:
      return 'bg-gradient-to-br from-sky-100 via-cyan-50 to-lime-50 text-slate-900';
  }
}

export default function SceneRenderer({ scene, isPlaying = true, onSceneComplete }: SceneRendererProps) {
  const templateId = scene.visual?.templateId;
  if (templateId) {
    return (
      <AnimationRenderer
        config={{
          templateId,
          params: scene.visual?.templateParams || {},
          narration: scene.narration,
          onScreenText: scene.onScreenText || scene.visual?.caption,
          durationSec: scene.durationSec,
        }}
        isPlaying={isPlaying}
        onSceneComplete={onSceneComplete}
      />
    );
  }

  const characters = scene.visual?.characters || [];
  const items = scene.visual?.items || [];
  const effects = scene.visual?.effects || [];

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-outline-variant/20 p-5 min-h-[240px]',
        backgroundClass(scene.visual?.background?.type),
      )}
      style={{
        backgroundColor: scene.visual?.background?.themeColor || undefined,
      }}
    >
      <div className="absolute inset-0 opacity-40">
        <div className="absolute -top-8 right-8 h-24 w-24 rounded-full bg-white/30 blur-2xl" />
        <div className="absolute bottom-0 left-0 h-28 w-28 rounded-full bg-white/20 blur-2xl" />
      </div>

      <div className="relative flex h-full flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">{scene.title}</p>
            {(scene.onScreenText || scene.visual?.caption) && (
              <h3 className="mt-2 text-2xl font-black">
                {scene.onScreenText || scene.visual?.caption}
              </h3>
            )}
          </div>
          {effects.length > 0 && (
            <div className="flex flex-wrap justify-end gap-2">
              {effects.slice(0, 3).map((effect, index) => (
                <span key={`${effect}-${index}`} className="rounded-full bg-white/35 px-3 py-1 text-xs font-semibold backdrop-blur">
                  {effect}
                </span>
              ))}
            </div>
          )}
        </div>

        {scene.narration && (
          <p className="max-w-2xl text-sm leading-6 opacity-85">{scene.narration}</p>
        )}

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap gap-3">
            {characters.map((character) => (
              <div
                key={character.id}
                className="flex min-w-[88px] items-center gap-2 rounded-2xl bg-white/40 px-3 py-2 backdrop-blur"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/70 text-sm font-black">
                  {character.label.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{character.label}</p>
                  {(character.pose || character.mood) && (
                    <p className="truncate text-xs opacity-70">{character.pose || character.mood}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {items.map((item) => (
              <span
                key={item.id}
                className="rounded-full border border-white/35 bg-white/25 px-3 py-1 text-xs font-medium backdrop-blur"
              >
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
