// 知识书浏览 — 孩子查看已提取的知识书内容
// 支持按章节浏览、查看术语表、查看模式列表

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/api_service.dart';
import '../../providers/user_provider.dart';
import '../../theme/app_theme.dart';

class BookSkillBrowseScreen extends StatefulWidget {
  const BookSkillBrowseScreen({super.key});

  @override
  State<BookSkillBrowseScreen> createState() => _BookSkillBrowseScreenState();
}

class _BookSkillBrowseScreenState extends State<BookSkillBrowseScreen> {
  final _api = ApiService();
  List<Map<String, dynamic>> _books = [];
  bool _loading = true;
  String? _ageFilter;

  @override
  void initState() {
    super.initState();
    _loadBooks();
  }

  Future<void> _loadBooks() async {
    setState(() => _loading = true);
    try {
      final params = <String, String>{'status': 'ready'};
      if (_ageFilter != null) params['ageGroup'] = _ageFilter!;
      final data = await _api.get('/book-skill/list', queryParams: params);
      final list = data?['items'] as List? ?? [];
      setState(() => _books = list.cast<Map<String, dynamic>>());
    } catch (e) {
      debugPrint('Failed to load books: $e');
    } finally {
      setState(() => _loading = false);
    }
  }

  String _formatSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  IconData _fileIcon(String fileType) {
    switch (fileType) {
      case 'pdf':
        return Icons.picture_as_pdf;
      case 'epub':
        return Icons.book;
      default:
        return Icons.article;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('知识书')),
      body: Column(
        children: [
          // Age filter chips
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                _FilterChip(
                  label: '全部',
                  selected: _ageFilter == null,
                  onTap: () {
                    setState(() => _ageFilter = null);
                    _loadBooks();
                  },
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: '3-4岁',
                  selected: _ageFilter == '3-4',
                  onTap: () {
                    setState(() => _ageFilter = '3-4');
                    _loadBooks();
                  },
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: '5-6岁',
                  selected: _ageFilter == '5-6',
                  onTap: () {
                    setState(() => _ageFilter = '5-6');
                    _loadBooks();
                  },
                ),
              ],
            ),
          ),
          // Book list
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _books.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.menu_book_rounded, size: 80, color: Colors.grey[300]),
                            const SizedBox(height: 16),
                            Text(
                              '还没有知识书',
                              style: TextStyle(fontSize: 18, color: Colors.grey[500]),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              '让家长上传书籍后就可以在这里学习啦',
                              style: TextStyle(fontSize: 14, color: Colors.grey[400]),
                            ),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: _loadBooks,
                        child: ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _books.length,
                          itemBuilder: (context, index) {
                            final book = _books[index];
                            final fileType = book['fileType'] as String? ?? 'pdf';
                            final fileSize = book['fileSize'] as int? ?? 0;
                            final chapters = book['totalChapters'] as int? ?? 0;
                            final viewCount = book['viewCount'] as int? ?? 0;

                            return Card(
                              margin: const EdgeInsets.only(bottom: 12),
                              child: InkWell(
                                borderRadius: BorderRadius.circular(12),
                                onTap: () {
                                  Navigator.pushNamed(context, '/book-skill/detail', arguments: {
                                    'bookId': book['id'],
                                  });
                                },
                                child: Padding(
                                  padding: const EdgeInsets.all(16),
                                  child: Row(
                                    children: [
                                      Container(
                                        width: 48,
                                        height: 60,
                                        decoration: BoxDecoration(
                                          color: AppTheme.primaryColor.withOpacity(0.1),
                                          borderRadius: BorderRadius.circular(8),
                                        ),
                                        child: Icon(
                                          _fileIcon(fileType),
                                          size: 28,
                                          color: AppTheme.primaryColor,
                                        ),
                                      ),
                                      const SizedBox(width: 16),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              book['title'] as String? ?? '未命名',
                                              style: const TextStyle(
                                                fontSize: 16,
                                                fontWeight: FontWeight.w600,
                                              ),
                                              maxLines: 2,
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                            const SizedBox(height: 4),
                                            Text(
                                              '${chapters > 0 ? "$chapters 章" : ""} · ${_formatSize(fileSize)}',
                                              style: TextStyle(
                                                fontSize: 13,
                                                color: Colors.grey[500],
                                              ),
                                            ),
                                            if (viewCount > 0)
                                              Padding(
                                                padding: const EdgeInsets.only(top: 2),
                                                child: Row(
                                                  children: [
                                                    Icon(Icons.visibility_outlined,
                                                        size: 14, color: Colors.grey[400]),
                                                    const SizedBox(width: 4),
                                                    Text(
                                                      '$viewCount 次浏览',
                                                      style: TextStyle(
                                                        fontSize: 12,
                                                        color: Colors.grey[400],
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                              ),
                                          ],
                                        ),
                                      ),
                                      const Icon(Icons.chevron_right, color: Colors.grey),
                                    ],
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? AppTheme.primaryColor : Colors.grey[100],
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? Colors.white : Colors.grey[700],
            fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
            fontSize: 14,
          ),
        ),
      ),
    );
  }
}

// ─── Book Detail Screen (Shared by parent & child) ───

class BookSkillDetailScreen extends StatefulWidget {
  final int bookId;

  const BookSkillDetailScreen({super.key, required this.bookId});

  @override
  State<BookSkillDetailScreen> createState() => _BookSkillDetailScreenState();
}

class _BookSkillDetailScreenState extends State<BookSkillDetailScreen>
    with SingleTickerProviderStateMixin {
  final _api = ApiService();
  Map<String, dynamic>? _book;
  List<Map<String, dynamic>> _chapters = [];
  List<Map<String, dynamic>> _terms = [];
  List<Map<String, dynamic>> _patterns = [];
  bool _loading = true;
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadBook();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadBook() async {
    setState(() => _loading = true);
    try {
      final book = await _api.get('/book-skill/${widget.bookId}');
      final chapters = await _api.get('/book-skill/${widget.bookId}/chapters');
      final terms = await _api.get('/book-skill/${widget.bookId}/terms');
      final patterns = await _api.get('/book-skill/${widget.bookId}/patterns');

      setState(() {
        _book = book as Map<String, dynamic>;
        _chapters = (chapters as List?)?.cast<Map<String, dynamic>>() ?? [];
        _terms = (terms as List?)?.cast<Map<String, dynamic>>() ?? [];
        _patterns = (patterns as List?)?.cast<Map<String, dynamic>>() ?? [];
      });
    } catch (e) {
      debugPrint('Failed to load book detail: $e');
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: const Text('知识书详情')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_book == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('知识书详情')),
        body: const Center(child: Text('加载失败')),
      );
    }

    final title = _book!['title'] as String? ?? '知识书';

    return Scaffold(
      appBar: AppBar(
        title: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
        bottom: TabBar(
          controller: _tabController,
          tabs: [
            Tab(text: '章节 (${_chapters.length})'),
            Tab(text: '术语 (${_terms.length})'),
            Tab(text: '模式 (${_patterns.length})'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildChaptersTab(),
          _buildTermsTab(),
          _buildPatternsTab(),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          // Open AI chat with this book as context
          Navigator.pushNamed(context, '/ai/chat', arguments: {
            'context': {
              'bookId': widget.bookId,
              'bookTitle': title,
            },
          });
        },
        icon: const Icon(Icons.auto_awesome),
        label: const Text('AI 提问'),
      ),
    );
  }

  Widget _buildChaptersTab() {
    if (_chapters.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.list_alt, size: 64, color: Colors.grey[300]),
            const SizedBox(height: 16),
            Text('暂无章节', style: TextStyle(color: Colors.grey[500])),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _chapters.length,
      itemBuilder: (context, index) {
        final ch = _chapters[index];
        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ExpansionTile(
            leading: CircleAvatar(
              backgroundColor: AppTheme.primaryColor.withOpacity(0.1),
              child: Text('${ch['index'] ?? index + 1}', style: const TextStyle(fontWeight: FontWeight.bold)),
            ),
            title: Text(ch['title'] as String? ?? '第${index + 1}章'),
            subtitle: ch['summary'] != null && (ch['summary'] as String).isNotEmpty
                ? Text(
                    ch['summary'] as String,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                  )
                : null,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (ch['summary'] != null && (ch['summary'] as String).isNotEmpty)
                      Text(
                        ch['summary'] as String,
                        style: TextStyle(fontSize: 14, color: Colors.grey[800], height: 1.5),
                      ),
                    const SizedBox(height: 12),
                    // Key points if available
                    if (ch['keyPoints'] != null && (ch['keyPoints'] as String).isNotEmpty)
                      ...(() {
                        try {
                          final points = List<dynamic>.from(
                            (ch['keyPoints'] as String).contains('[')
                                ? (ch['keyPoints'] as String).startsWith('[')
                                    ? List<dynamic>.from(
                                        (ch['keyPoints'] as String).contains('"')
                                            ? []
                                            : ch['keyPoints'].toString().split(','))
                                    : []
                                : ch['keyPoints'].toString().split('\n'));
                          return points.take(5).map((p) => Padding(
                                padding: const EdgeInsets.only(bottom: 4),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text('• ', style: TextStyle(color: AppTheme.primaryColor)),
                                    Expanded(child: Text(p.toString(), style: const TextStyle(fontSize: 13))),
                                  ],
                                ),
                              ));
                        } catch (_) {
                          return <Widget>[];
                        }
                      })(),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildTermsTab() {
    if (_terms.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.menu_book, size: 64, color: Colors.grey[300]),
            const SizedBox(height: 16),
            Text('暂无术语', style: TextStyle(color: Colors.grey[500])),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _terms.length,
      itemBuilder: (context, index) {
        final term = _terms[index];
        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            title: Text(
              term['term'] as String? ?? '',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            subtitle: Text(term['definition'] as String? ?? ''),
            trailing: term['chapterRef'] != null && (term['chapterRef'] as String).isNotEmpty
                ? Chip(
                    label: Text(term['chapterRef'] as String, style: const TextStyle(fontSize: 11)),
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  )
                : null,
          ),
        );
      },
    );
  }

  Widget _buildPatternsTab() {
    if (_patterns.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.category, size: 64, color: Colors.grey[300]),
            const SizedBox(height: 16),
            Text('暂无模式', style: TextStyle(color: Colors.grey[500])),
          ],
        ),
      );
    }

    // Group by category
    final grouped = <String, List<Map<String, dynamic>>>{};
    for (final p in _patterns) {
      final cat = p['category'] as String? ?? '通用';
      grouped.putIfAbsent(cat, () => []).add(p);
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: grouped.entries.map((entry) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 8, bottom: 8),
              child: Text(
                entry.key,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
            ...entry.value.map((p) => Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Text(p['name'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: p['description'] != null
                        ? Text(p['description'] as String)
                        : null,
                  ),
                )),
          ],
        );
      }).toList(),
    );
  }
}