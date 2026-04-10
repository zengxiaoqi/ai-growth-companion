import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, BookOpen, Clock3, ArrowDownTray } from '@/icons';
import api from '@/services/api';
import type { CoursePackRecord } from '@/types';
import { Button, Card, EmptyState } from '../ui';

interface CoursePackManagerProps {
  selectedChildId: number | null;
  onCoursePackGenerated?: () => void | Promise<void>;
}

const FOCUS_OPTIONS = [
  { value: 'mixed', label: '综合' },
  { value: 'literacy', label: '语文' },
  { value: 'math', label: '数学' },
  { value: 'science', label: '科学' },
] as const;

type ExportFormat =
  | 'bundle_zip'
  | 'capcut_json'
  | 'narration_txt'
  | 'narration_mp3'
  | 'teaching_video_mp4'
  | 'storyboard_csv'
  | 'subtitle_srt'
  | 'subtitle_srt_bilingual';

export default function CoursePackManager({ selectedChildId, onCoursePackGenerated }: CoursePackManagerProps) {
  const [topic, setTopic] = useState('');
  const [focus, setFocus] = useState<(typeof FOCUS_OPTIONS)[number]['value']>('mixed');
  const [durationMinutes, setDurationMinutes] = useState(20);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packs, setPacks] = useState<CoursePackRecord[]>([]);
  const [selectedRecordIds, setSelectedRecordIds] = useState<number[]>([]);
  const [preview, setPreview] = useState<Record<string, any> | null>(null);
  const [previewRecordId, setPreviewRecordId] = useState<number | null>(null);
  const [versionHistory, setVersionHistory] = useState<CoursePackRecord[]>([]);
  const [editableJson, setEditableJson] = useState('');
  const [versionNote, setVersionNote] = useState('');
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [isBatchExporting, setIsBatchExporting] = useState(false);
  const [isSavingVersion, setIsSavingVersion] = useState(false);
  const [isEnrichingBilingual, setIsEnrichingBilingual] = useState(false);
  const [isGeneratingWeekly, setIsGeneratingWeekly] = useState(false);
  const [weeklyDays, setWeeklyDays] = useState(7);
  const [weeklyStartDate, setWeeklyStartDate] = useState(() => new Date().toISOString().slice(0, 10));

  const loadPacks = useCallback(async () => {
    if (!selectedChildId) {
      setPacks([]);
      setSelectedRecordIds([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.getCoursePacks(selectedChildId, { limit: 20 });
      const nextList = result.list || [];
      setPacks(nextList);
      setSelectedRecordIds((previous) => previous.filter((id) => nextList.some((item) => item.id === id)));
    } catch (fetchError: any) {
      setError(fetchError?.message || '获取课程包失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  }, [selectedChildId]);

  useEffect(() => {
    loadPacks().catch(() => {});
  }, [loadPacks]);

  useEffect(() => {
    if (preview) {
      setEditableJson(JSON.stringify(preview, null, 2));
      return;
    }
    setEditableJson('');
  }, [preview]);

  const loadVersionHistory = useCallback(async (recordId: number) => {
    try {
      const result = await api.getCoursePackVersions(recordId, { limit: 20 });
      setVersionHistory(result?.list || []);
    } catch {
      setVersionHistory([]);
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!selectedChildId || !topic.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const result = await api.generateCoursePack({
        topic: topic.trim(),
        parentPrompt: topic.trim(),
        childId: selectedChildId,
        focus,
        durationMinutes,
        includeGame: true,
        includeAudio: true,
        includeVideo: true,
      });
      setPreview(result);
      setPreviewRecordId(result?.coursePackRecordId || null);
      if (result?.coursePackRecordId) {
        await loadVersionHistory(result.coursePackRecordId);
      } else {
        setVersionHistory([]);
      }
      setTopic('');
      await loadPacks();
      if (onCoursePackGenerated) await onCoursePackGenerated();
    } catch (genError: any) {
      setError(genError?.message || '生成课程包失败，请稍后重试');
    } finally {
      setIsGenerating(false);
    }
  }, [durationMinutes, focus, loadPacks, loadVersionHistory, onCoursePackGenerated, selectedChildId, topic]);

  const handleViewPack = useCallback(async (record: CoursePackRecord) => {
    setPreviewRecordId(record.id);
    setError(null);
    try {
      const row = await api.getCoursePackById(record.id);
      setPreview(row?.planContent || null);
      await loadVersionHistory(record.id);
    } catch (viewError: any) {
      setError(viewError?.message || '获取课程包详情失败');
    }
  }, [loadVersionHistory]);

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (!previewRecordId) {
        setError('请先选择一个已保存的课程包再导出');
        return;
      }
      setExportingFormat(format);
      setError(null);
      try {
        await api.downloadCoursePackExport(previewRecordId, format);
      } catch (exportError: any) {
        setError(exportError?.message || '导出失败，请稍后重试');
      } finally {
        setExportingFormat(null);
      }
    },
    [previewRecordId],
  );

  const handleToggleSelected = useCallback((id: number) => {
    setSelectedRecordIds((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id],
    );
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    const allIds = packs.map((item) => item.id);
    setSelectedRecordIds((previous) => (previous.length === allIds.length ? [] : allIds));
  }, [packs]);

  const handleBatchExport = useCallback(
    async (formats: ExportFormat[]) => {
      if (selectedRecordIds.length === 0) {
        setError('请先勾选至少一个课程包');
        return;
      }
      setIsBatchExporting(true);
      setError(null);
      try {
        await api.downloadCoursePackBatchExport(selectedRecordIds, formats);
      } catch (batchError: any) {
        setError(batchError?.message || '批量导出失败，请稍后重试');
      } finally {
        setIsBatchExporting(false);
      }
    },
    [selectedRecordIds],
  );

  const handleSaveVersion = useCallback(async () => {
    if (!previewRecordId) {
      setError('请先选择一个课程包');
      return;
    }
    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(editableJson);
    } catch {
      setError('JSON 格式不正确，请先修正后再保存');
      return;
    }
    setIsSavingVersion(true);
    setError(null);
    try {
      const result = await api.saveCoursePackVersion(previewRecordId, {
        planContent: parsed,
        note: versionNote || 'manual_edit',
      });
      setPreview(result);
      setPreviewRecordId(result?.coursePackRecordId || previewRecordId);
      setVersionNote('');
      await loadPacks();
      if (result?.coursePackRecordId) {
        await loadVersionHistory(result.coursePackRecordId);
      }
    } catch (saveError: any) {
      setError(saveError?.message || '保存版本失败');
    } finally {
      setIsSavingVersion(false);
    }
  }, [editableJson, loadPacks, loadVersionHistory, previewRecordId, versionNote]);

  const handleEnrichBilingual = useCallback(async () => {
    if (!previewRecordId) {
      setError('请先选择一个课程包');
      return;
    }
    setIsEnrichingBilingual(true);
    setError(null);
    try {
      const result = await api.enrichCoursePackBilingual(previewRecordId, {
        saveAsVersion: true,
        overwrite: false,
      });
      setPreview(result);
      setPreviewRecordId(result?.coursePackRecordId || previewRecordId);
      await loadPacks();
      if (result?.coursePackRecordId) {
        await loadVersionHistory(result.coursePackRecordId);
      }
    } catch (enrichError: any) {
      setError(enrichError?.message || '双语补全失败');
    } finally {
      setIsEnrichingBilingual(false);
    }
  }, [loadPacks, loadVersionHistory, previewRecordId]);

  const handleGenerateWeekly = useCallback(async () => {
    if (!selectedChildId || !topic.trim()) return;
    setIsGeneratingWeekly(true);
    setError(null);
    try {
      const result = await api.generateWeeklyCoursePacks({
        topic: topic.trim(),
        parentPrompt: topic.trim(),
        childId: selectedChildId,
        focus,
        durationMinutes,
        includeGame: true,
        includeAudio: true,
        includeVideo: true,
        days: weeklyDays,
        startDate: weeklyStartDate,
      });
      setPreview(result);
      setPreviewRecordId(null);
      setVersionHistory([]);
      await loadPacks();
      if (onCoursePackGenerated) await onCoursePackGenerated();
    } catch (weeklyError: any) {
      setError(weeklyError?.message || '生成周计划失败，请稍后重试');
    } finally {
      setIsGeneratingWeekly(false);
    }
  }, [durationMinutes, focus, loadPacks, onCoursePackGenerated, selectedChildId, topic, weeklyDays, weeklyStartDate]);

  const sortedPacks = useMemo(
    () => [...packs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [packs],
  );

  return (
    <section className="space-y-4" aria-label="课程包生成">
      <Card className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-base font-black text-on-surface">一句话生成课程包</h3>
        </div>

        <div>
          <label htmlFor="course-pack-topic" className="mb-1 block text-xs font-bold text-on-surface-variant">
            家长需求
          </label>
          <input
            id="course-pack-topic"
            type="text"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="例如：用故事视频讲解汉字“日月山川”"
            className="h-11 w-full rounded-xl border border-outline-variant/30 bg-surface px-3 text-sm outline-none transition focus:border-primary"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-bold text-on-surface-variant">重点方向</label>
            <select
              value={focus}
              onChange={(event) => setFocus(event.target.value as any)}
              className="h-11 w-full rounded-xl border border-outline-variant/30 bg-surface px-3 text-sm outline-none transition focus:border-primary"
            >
              {FOCUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-on-surface-variant">课程时长（分钟）</label>
            <select
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(Number(event.target.value))}
              className="h-11 w-full rounded-xl border border-outline-variant/30 bg-surface px-3 text-sm outline-none transition focus:border-primary"
            >
              {[15, 20, 25, 30, 40].map((m) => (
                <option key={m} value={m}>
                  {m} 分钟
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-bold text-on-surface-variant">周计划开始日期</label>
            <input
              type="date"
              value={weeklyStartDate}
              onChange={(event) => setWeeklyStartDate(event.target.value)}
              className="h-11 w-full rounded-xl border border-outline-variant/30 bg-surface px-3 text-sm outline-none transition focus:border-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-on-surface-variant">天数</label>
            <select
              value={weeklyDays}
              onChange={(event) => setWeeklyDays(Number(event.target.value))}
              className="h-11 w-full rounded-xl border border-outline-variant/30 bg-surface px-3 text-sm outline-none transition focus:border-primary"
            >
              {[3, 5, 7, 10, 14].map((d) => (
                <option key={d} value={d}>
                  {d} 天
                </option>
              ))}
            </select>
          </div>
        </div>

        <Button className="w-full" onClick={handleGenerate} disabled={!selectedChildId || !topic.trim() || isGenerating || isGeneratingWeekly}>
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              正在生成单节课程包...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              立即生成单节课程包
            </>
          )}
        </Button>

        <Button className="w-full" variant="ghost" onClick={handleGenerateWeekly} disabled={!selectedChildId || !topic.trim() || isGenerating || isGeneratingWeekly}>
          {isGeneratingWeekly ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              正在批量生成周课程...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              一键生成周课程（批量）
            </>
          )}
        </Button>

        {error ? (
          <div className="rounded-xl border border-error/30 bg-error-container/15 px-3 py-2 text-xs text-error">
            {error}
          </div>
        ) : null}
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-black text-on-surface">历史课程包</h3>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-on-surface-variant">已选 {selectedRecordIds.length}</span>
            <Button size="sm" variant="ghost" onClick={handleToggleSelectAll} disabled={packs.length === 0 || isBatchExporting}>
              {selectedRecordIds.length === packs.length && packs.length > 0 ? '取消全选' : '全选'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleBatchExport(['bundle_zip'])}
              disabled={selectedRecordIds.length === 0 || isBatchExporting}
            >
              {isBatchExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownTray className="h-4 w-4" />}
              批量导出 ZIP
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                handleBatchExport([
                  'capcut_json',
                  'narration_txt',
                  'narration_mp3',
                  'teaching_video_mp4',
                  'storyboard_csv',
                  'subtitle_srt',
                  'subtitle_srt_bilingual',
                ])
              }
              disabled={selectedRecordIds.length === 0 || isBatchExporting}
            >
              {isBatchExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownTray className="h-4 w-4" />}
              批量导出制作文件
            </Button>
            <Button size="sm" variant="ghost" onClick={() => loadPacks()}>
              刷新
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中...
          </div>
        ) : sortedPacks.length === 0 ? (
          <EmptyState
            title="暂无课程包"
            description="生成后会自动保存到这里，方便反复使用。"
            icon={<BookOpen className="h-5 w-5 text-primary" />}
          />
        ) : (
          <div className="space-y-2">
            {sortedPacks.map((record) => (
              <div
                key={record.id}
                className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                  previewRecordId === record.id
                    ? 'border-primary/40 bg-primary-container/15'
                    : 'border-outline-variant/25 bg-surface-container-lowest hover:border-primary/30'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <label className="mt-0.5 flex items-center gap-2 text-xs text-on-surface-variant">
                    <input
                      type="checkbox"
                      checked={selectedRecordIds.includes(record.id)}
                      onChange={() => handleToggleSelected(record.id)}
                      className="h-4 w-4 rounded border-outline-variant/40"
                    />
                    选择
                  </label>
                  <button
                    onClick={() => handleViewPack(record)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-semibold text-on-surface">{record.title}</p>
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-on-surface-variant">
                      <Clock3 className="h-3.5 w-3.5" />
                      {new Date(record.createdAt).toLocaleString('zh-CN')}
                    </p>
                  </button>
                  <span className="text-[10px] font-semibold text-on-surface-variant">#{record.id}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {preview ? (
        <Card className="space-y-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-black text-on-surface">课程包预览</h3>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleEnrichBilingual}
                disabled={!previewRecordId || isEnrichingBilingual || isSavingVersion}
              >
                {isEnrichingBilingual ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                自动补全双语
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleExport('bundle_zip')}
                disabled={!previewRecordId || !!exportingFormat || isSavingVersion}
              >
                {exportingFormat === 'bundle_zip' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownTray className="h-4 w-4" />}
                导出素材包 ZIP
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleExport('capcut_json')}
                disabled={!previewRecordId || !!exportingFormat || isSavingVersion}
              >
                {exportingFormat === 'capcut_json' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownTray className="h-4 w-4" />}
                导出 CapCut JSON
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleExport('narration_txt')}
                disabled={!previewRecordId || !!exportingFormat || isSavingVersion}
              >
                {exportingFormat === 'narration_txt' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownTray className="h-4 w-4" />}
                导出配音 TXT
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleExport('narration_mp3')}
                disabled={!previewRecordId || !!exportingFormat || isSavingVersion}
              >
                {exportingFormat === 'narration_mp3' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownTray className="h-4 w-4" />}
                导出配音 MP3
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleExport('teaching_video_mp4')}
                disabled={!previewRecordId || !!exportingFormat || isSavingVersion}
              >
                {exportingFormat === 'teaching_video_mp4' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownTray className="h-4 w-4" />}
                导出教学视频 MP4
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleExport('storyboard_csv')}
                disabled={!previewRecordId || !!exportingFormat || isSavingVersion}
              >
                {exportingFormat === 'storyboard_csv' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownTray className="h-4 w-4" />}
                导出分镜 CSV
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleExport('subtitle_srt')}
                disabled={!previewRecordId || !!exportingFormat || isSavingVersion}
              >
                {exportingFormat === 'subtitle_srt' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownTray className="h-4 w-4" />}
                导出字幕 SRT
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleExport('subtitle_srt_bilingual')}
                disabled={!previewRecordId || !!exportingFormat || isSavingVersion}
              >
                {exportingFormat === 'subtitle_srt_bilingual' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownTray className="h-4 w-4" />}
                导出双语字幕 SRT
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_220px]">
            <div className="space-y-2">
              <label className="text-xs font-bold text-on-surface-variant">可编辑 JSON（保存将生成新版本）</label>
              <textarea
                value={editableJson}
                onChange={(event) => setEditableJson(event.target.value)}
                className="min-h-[340px] w-full rounded-xl border border-outline-variant/30 bg-surface-container-low p-3 text-[11px] leading-5 text-on-surface outline-none transition focus:border-primary"
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={versionNote}
                  onChange={(event) => setVersionNote(event.target.value)}
                  placeholder="版本备注，例如：补充双语旁白"
                  className="h-10 min-w-[220px] flex-1 rounded-xl border border-outline-variant/30 bg-surface px-3 text-xs outline-none transition focus:border-primary"
                />
                <Button size="sm" onClick={handleSaveVersion} disabled={!previewRecordId || isSavingVersion || isEnrichingBilingual}>
                  {isSavingVersion ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  保存为新版本
                </Button>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-2">
              <p className="px-1 text-xs font-bold text-on-surface-variant">版本历史</p>
              {versionHistory.length === 0 ? (
                <p className="px-1 py-2 text-[11px] text-on-surface-variant">暂无版本记录</p>
              ) : (
                <div className="space-y-1">
                  {versionHistory.map((row) => (
                    <button
                      key={row.id}
                      onClick={() => handleViewPack(row)}
                      className={`w-full rounded-lg border px-2 py-1 text-left ${
                        previewRecordId === row.id
                          ? 'border-primary/40 bg-primary-container/15'
                          : 'border-outline-variant/25 bg-surface hover:border-primary/30'
                      }`}
                    >
                      <p className="truncate text-[11px] font-semibold text-on-surface">#{row.id} {row.title}</p>
                      <p className="text-[10px] text-on-surface-variant">{new Date(row.createdAt).toLocaleString('zh-CN')}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      ) : null}
    </section>
  );
}
