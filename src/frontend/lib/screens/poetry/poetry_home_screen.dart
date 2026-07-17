import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';
import '../../services/poetry_service.dart';
import '../../services/api_service.dart';
import 'poetry_detail_screen.dart';
import 'poetry_game_screen.dart';

/// 诗词模块首页
class PoetryHomeScreen extends StatefulWidget {
  const PoetryHomeScreen({super.key});

  @override
  State<PoetryHomeScreen> createState() => _PoetryHomeScreenState();
}

class _PoetryHomeScreenState extends State<PoetryHomeScreen> {
  late final PoetryService _poetryService;
  
  List<Poem> _poems = [];
  bool _isLoading = true;
  String? _error;
  int _currentPage = 1;
  bool _hasMore = true;
  
  // 搜索相关
  final _searchController = TextEditingController();
  bool _isSearching = false;
  List<Poem> _searchResults = [];

  // 搜索类型过滤
  String _selectedSearchType = 'all';
  
  // 繁简切换：zh-Hans（简体）或 zh-Hant（繁体）
  String _lang = 'zh-Hans';
  final List<Map<String, String>> _searchTypes = [
    {'value': 'all', 'label': '全部'},
    {'value': 'title', 'label': '标题'},
    {'value': 'content', 'label': '内容'},
    {'value': 'author', 'label': '作者'},
    {'value': 'dynasty', 'label': '朝代'},
    {'value': 'poem_type', 'label': '体裁'},
  ];

  @override
  void initState() {
    super.initState();
    _poetryService = PoetryService(ApiService());
    _loadData();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final result = await _poetryService.getPoems(page: 1, pageSize: 20, lang: _lang);
      setState(() {
        _poems = result.list;
        _hasMore = _poems.length < result.total;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = '加载失败: $e';
        _isLoading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    if (!_hasMore || _isLoading || _isSearching) return;

    setState(() => _isLoading = true);

    try {
      final result = await _poetryService.getPoems(
        page: _currentPage + 1,
        pageSize: 20,
        lang: _lang,
      );

      setState(() {
        _poems.addAll(result.list);
        _currentPage++;
        _hasMore = _poems.length < result.total;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('加载更多失败: $e')),
        );
      }
    }
  }

  Future<void> _search(String query, String searchType) async {
    if (query.isEmpty) {
      setState(() {
        _isSearching = false;
        _searchResults = [];
      });
      return;
    }

    setState(() => _isSearching = true);

    try {
      final result = await _poetryService.searchPoems(query: query, searchType: searchType, lang: _lang);
      setState(() => _searchResults = result.list);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('搜索失败: $e')),
        );
      }
    }
  }

  Future<void> _showRandomPoem() async {
    try {
      final poem = await _poetryService.getRandomPoem(lang: _lang);
      if (poem != null && mounted) {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => PoetryDetailScreen(poemId: poem.id, lang: _lang),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('获取随机诗词失败: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: _isSearching
            ? TextField(
                controller: _searchController,
                autofocus: true,
                decoration: InputDecoration(
                  hintText: '搜索诗词...',
                  border: InputBorder.none,
                  hintStyle: TextStyle(
                    color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4),
                  ),
                ),
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurface,
                ),
                onChanged: (value) => _search(value, _selectedSearchType),
              )
            : const Text('诗词鉴赏'),
        actions: [
          if (_isSearching)
            IconButton(
              icon: const Icon(Icons.close),
              onPressed: () {
                _searchController.clear();
                setState(() => _isSearching = false);
              },
            )
          else ...[
            IconButton(
              icon: const Icon(Icons.search),
              onPressed: () => setState(() => _isSearching = true),
            ),
            IconButton(
              icon: const Icon(Icons.casino),
              tooltip: '随机诗词',
              onPressed: _showRandomPoem,
            ),
            // 繁简切换按钮
            TextButton(
              onPressed: () {
                setState(() {
                  _lang = _lang == 'zh-Hans' ? 'zh-Hant' : 'zh-Hans';
                });
                _loadData();
                if (_isSearching) {
                  _search(_searchController.text.trim(), _selectedSearchType);
                }
              },
              child: Text(
                _lang == 'zh-Hans' ? '繁' : '简',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.primaryColor,
                ),
              ),
            ),
          ],
        ],
      ),
      body: _buildBody(),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const PoetryGameScreen()),
          );
        },
        tooltip: '诗词游戏',
        backgroundColor: const Color(0xFF8B2500),
        foregroundColor: Colors.white,
        child: const Icon(Icons.games),
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading && _poems.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null && _poems.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 64, color: Colors.grey),
            const SizedBox(height: 16),
            Text(_error!, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loadData,
              child: const Text('重试'),
            ),
          ],
        ),
      );
    }

    if (_isSearching) {
      return _buildSearchResults();
    }

    return _buildPoemList();
  }

  Widget _buildSearchResults() {
    if (_searchResults.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.search_off, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text('未找到相关诗词'),
          ],
        ),
      );
    }

    final theme = Theme.of(context);
    return Column(
      children: [
        // Search type filter chips
        Container(
          height: 40,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            itemCount: _searchTypes.length,
            itemBuilder: (context, index) {
              final type = _searchTypes[index];
              final isSelected = _selectedSearchType == type['value'];
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilterChip(
                  label: Text(type['label']!),
                  selected: isSelected,
                  onSelected: (_) {
                    setState(() => _selectedSearchType = type['value']!);
                    final query = _searchController.text.trim();
                    if (query.isNotEmpty) {
                      _search(query, type['value']!);
                    }
                  },
                  backgroundColor: theme.colorScheme.surfaceContainerHighest,
                  selectedColor: theme.colorScheme.secondaryContainer,
                  checkmarkColor: theme.colorScheme.onSecondaryContainer,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                    side: BorderSide(color: theme.colorScheme.outline),
                  ),
                ),
              );
            },
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: _searchResults.length,
            itemBuilder: (context, index) => _buildPoemCard(_searchResults[index]),
          ),
        ),
      ],
    );
  }

  Widget _buildPoemList() {
    return NotificationListener<ScrollNotification>(
      onNotification: (notification) {
        if (notification.metrics.pixels >= notification.metrics.maxScrollExtent - 200) {
          _loadMore();
        }
        return false;
      },
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _poems.length + (_hasMore ? 1 : 0),
        itemBuilder: (context, index) {
          if (index >= _poems.length) {
            return const Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator()),
            );
          }
          return _buildPoemCard(_poems[index]);
        },
      ),
    );
  }

  Widget _buildPoemCard(Poem poem) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => PoetryDetailScreen(poemId: poem.id, lang: _lang),
            ),
          );
        },
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 标题行
              Row(
                children: [
                  Expanded(
                    child: Text(
                      poem.title,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  if (poem.type != null) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFF7EC8E3).withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        poem.type!,
                        style: const TextStyle(
                          fontSize: 12,
                          color: Color(0xFF1565C0),
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 8),
              // 作者和朝代
              Row(
                children: [
                  if (poem.dynasty != null) ...[
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFB6C1).withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        poem.dynasty!.name,
                        style: const TextStyle(
                          fontSize: 12,
                          color: Color(0xFF8B2500),
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                  ],
                  if (poem.author != null) ...[
                    Icon(Icons.person, size: 14, color: Colors.grey[600]),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(
                        poem.author!.name,
                        style: TextStyle(color: Colors.grey[600], fontSize: 14),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 12),
              // 诗词内容预览（前两行）
              ...poem.contentLines.take(2).map(
                (line) => Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text(
                    line,
                    style: const TextStyle(fontSize: 15, height: 1.5),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
              if (poem.contentLines.length > 2)
                Text(
                  '...',
                  style: TextStyle(color: Colors.grey[500]),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
