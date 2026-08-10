import { useCallback, useEffect, useState } from 'react';
import { Loader2, BookOpen, X, ChevronRight, Plus } from '@/icons';
import api from '../../services/api';
import { Card, EmptyState } from '../ui';
import { cn } from '../../lib/utils';

interface BookSkill {
  id: number;
  title: string;
  author?: string;
  filePath: string;
  fileType: string;
  fileSize: number;
  totalChapters: number;
  status: string;
  viewCount: number;
  createdAt: string;
}

export default function BookSkillPanel() {
  const [books, setBooks] = useState<BookSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);

  const loadBooks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/book-skill/list');
      const items = data?.items ?? data ?? [];
      setBooks(items);
    } catch (e) {
      console.error('Failed to load books:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBooks(); }, [loadBooks]);

  const handleUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.epub,.docx,.txt,.md,.rtf';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', file.name.replace(/\.[^.]+$/, ''));

        const res = await fetch('/api/book-skill/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: formData,
        });
        if (res.ok) {
          await loadBooks();
        }
      } catch (e) {
        console.error('Upload failed:', e);
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除这本知识书？')) return;
    try {
      await api.delete(`/book-skill/${id}`);
      setBooks((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      console.error('Delete failed:', e);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const res = await api.get(`/book-skill/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(res);
    } catch (e) {
      console.error('Search failed:', e);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">就绪</span>;
      case 'processing':
        return <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">处理中...</span>;
      case 'failed':
        return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">失败</span>;
      default:
        return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">{status}</span>;
    }
  };

  const fileTypeIcon = (type: string) => {
    switch (type) {
      case 'pdf': return <BookOpen className="h-5 w-5 text-red-500" />;
      case 'epub': return <BookOpen className="h-5 w-5 text-blue-500" />;
      default: return <BookOpen className="h-5 w-5 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-on-surface">知识书</h3>
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-tactile transition-all active:translate-y-0.5 active:shadow-tactile-active disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {uploading ? '上传中...' : '上传书籍'}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="搜索知识书内容..."
          className="w-full rounded-full border border-outline-variant/30 bg-surface-container-low py-2.5 pl-4 pr-10 text-sm outline-none transition-colors focus:border-primary"
        />
        {searchQuery && (
          <button
            onClick={() => { setSearchQuery(''); setSearchResults(null); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Search results */}
      {searchResults && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-on-surface">搜索结果</h4>
            <button
              onClick={() => { setSearchResults(null); setSearchQuery(''); }}
              className="text-xs text-on-surface-variant hover:text-primary"
            >
              清除
            </button>
          </div>
          {searchResults.chapters?.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-on-surface-variant">章节匹配</p>
              {searchResults.chapters.slice(0, 5).map((ch: any, i: number) => (
                <div key={i} className="mb-2 rounded-lg bg-surface-container-high px-3 py-2 text-sm">
                  <span className="font-medium">{ch.title}</span>
                  <p className="mt-1 text-xs text-on-surface-variant line-clamp-2">{ch.summary}</p>
                </div>
              ))}
            </div>
          )}
          {searchResults.terms?.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-on-surface-variant">术语匹配</p>
              <div className="flex flex-wrap gap-2">
                {searchResults.terms.slice(0, 10).map((t: any, i: number) => (
                  <span key={i} className="rounded-full bg-primary-container px-3 py-1 text-xs font-medium text-primary">
                    {t.term}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Book list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : books.length === 0 ? (
        <EmptyState
          title="还没有知识书"
          description="上传 PDF/EPUB/DOCX 书籍，AI 自动提取知识内容"
          icon={<BookOpen className="h-8 w-8 text-primary" />}
        />
      ) : (
        <div className="space-y-3">
          {books.map((book) => (
            <Card key={book.id} className="group overflow-hidden">
              <div className="flex items-start gap-4 p-4">
                <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  {fileTypeIcon(book.fileType)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-semibold text-on-surface truncate">{book.title}</h4>
                      <p className="mt-0.5 text-xs text-on-surface-variant">
                        {formatSize(book.fileSize)}
                        {book.totalChapters > 0 ? ` · ${book.totalChapters} 章` : ''}
                        {book.viewCount > 0 ? ` · ${book.viewCount} 次浏览` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {statusBadge(book.status)}
                      <button
                        onClick={() => handleDelete(book.id)}
                        className="rounded-full p-1.5 text-on-surface-variant opacity-0 transition-all hover:bg-error-container hover:text-error group-hover:opacity-100"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
                <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-on-surface-variant" />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}