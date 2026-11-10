import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../components/empty_state.dart';
import '../../providers/user_provider.dart';
import '../../services/music_service.dart';
import '../../theme/app_theme.dart';

/// 音乐乐园 — 多音源儿歌搜索 + 在线播放
class MusicScreen extends StatefulWidget {
  const MusicScreen({super.key});

  @override
  State<MusicScreen> createState() => _MusicScreenState();
}

class _MusicScreenState extends State<MusicScreen> {
  final _searchController = TextEditingController();
  final AudioPlayer _player = AudioPlayer();

  MusicService? _musicService;
  List<MusicTrack> _tracks = [];
  bool _isLoading = false;
  bool _hasSearched = false;
  String? _error;

  MusicTrack? _current;
  bool _isPlaying = false;
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;

  final List<StreamSubscription> _subs = [];

  @override
  void initState() {
    super.initState();
    _subs.add(_player.onPlayerStateChanged.listen((state) {
      if (!mounted) return;
      setState(() => _isPlaying = state == PlayerState.playing);
    }));
    _subs.add(_player.onPositionChanged.listen((p) {
      if (!mounted) return;
      setState(() => _position = p);
    }));
    _subs.add(_player.onDurationChanged.listen((d) {
      if (!mounted) return;
      setState(() => _duration = d);
    }));
    _subs.add(_player.onPlayerComplete.listen((_) {
      if (!mounted) return;
      setState(() {
        _isPlaying = false;
        _position = Duration.zero;
      });
    }));
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    _player.dispose();
    _searchController.dispose();
    super.dispose();
  }

  MusicService? _resolveService() {
    if (_musicService != null) return _musicService;
    final api = context.read<UserProvider>().apiService;
    if (api == null) return null;
    _musicService = MusicService(api);
    return _musicService;
  }

  Future<void> _search() async {
    final query = _searchController.text.trim();
    if (query.isEmpty || _isLoading) return;
    FocusScope.of(context).unfocus();

    final service = _resolveService();
    if (service == null) {
      setState(() => _error = '登录状态失效，请重新登录');
      return;
    }

    setState(() {
      _isLoading = true;
      _error = null;
      _hasSearched = true;
    });
    try {
      final result = await service.search(query);
      if (!mounted) return;
      setState(() {
        _tracks = result.tracks;
        _isLoading = false;
        if (!result.enabled) {
          _error = '音乐功能暂未开启';
        } else if (result.tracks.isEmpty) {
          _error = '没有找到相关歌曲，换个关键词试试';
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _error = '搜索失败，请检查网络后重试';
      });
    }
  }

  Future<void> _playTrack(MusicTrack track) async {
    setState(() {
      _current = track;
      _position = Duration.zero;
      _duration = track.durationS != null
          ? Duration(seconds: track.durationS!)
          : Duration.zero;
    });
    try {
      await _player.play(UrlSource(track.audioUrl));
    } catch (e) {
      if (!mounted) return;
      setState(() => _isPlaying = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('播放失败，换一首试试')),
      );
    }
  }

  Future<void> _togglePlay() async {
    if (_current == null) return;
    if (_isPlaying) {
      await _player.pause();
    } else if (_position > Duration.zero && _position < _duration) {
      await _player.resume();
    } else {
      await _playTrack(_current!);
    }
  }

  Future<void> _stopAndClear() async {
    await _player.stop();
    if (!mounted) return;
    setState(() {
      _current = null;
      _isPlaying = false;
      _position = Duration.zero;
      _duration = Duration.zero;
    });
  }

  String _fmt(Duration d) {
    final m = d.inMinutes;
    final s = d.inSeconds % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('音乐乐园')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _searchController,
                    textInputAction: TextInputAction.search,
                    onSubmitted: (_) => _search(),
                    decoration: InputDecoration(
                      hintText: '搜索儿歌，比如：小星星',
                      prefixIcon: const Icon(Icons.search_rounded),
                      filled: true,
                      fillColor: Theme.of(context).colorScheme.surface,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide: BorderSide.none,
                      ),
                      contentPadding: const EdgeInsets.symmetric(vertical: 0),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: _isLoading ? null : _search,
                  style: FilledButton.styleFrom(
                    shape: const CircleBorder(),
                    padding: const EdgeInsets.all(14),
                  ),
                  child: _isLoading
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.arrow_forward_rounded),
                ),
              ],
            ),
          ),
          Expanded(child: _buildBody()),
          if (_current != null) _buildPlayerBar(),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return EmptyState(
        icon: Icons.music_off_rounded,
        title: _error!,
        actionLabel: _hasSearched ? '重新搜索' : null,
        onAction: _hasSearched ? _search : null,
      );
    }
    if (!_hasSearched) {
      return const EmptyState(
        emoji: '🎵',
        title: '想听什么歌？',
        subtitle: '输入歌名，搜索喜欢的儿歌',
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      itemCount: _tracks.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        final track = _tracks[index];
        final isCurrent = identical(track, _current) ||
            (_current != null &&
                track.url == _current!.url &&
                track.title == _current!.title);
        return Material(
          color: isCurrent
              ? AppTheme.softYellow
              : Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(16),
          child: ListTile(
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
            leading: Icon(
              isCurrent && _isPlaying
                  ? Icons.equalizer_rounded
                  : Icons.music_note_rounded,
              color: AppTheme.primaryColor,
            ),
            title: Text(
              track.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            subtitle: Text(
              track.artist,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (track.durationLabel.isNotEmpty)
                  Text(
                    track.durationLabel,
                    style: TextStyle(
                      fontSize: 12,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                const SizedBox(width: 8),
                Icon(
                  isCurrent && _isPlaying
                      ? Icons.pause_circle_filled_rounded
                      : Icons.play_circle_fill_rounded,
                  color: AppTheme.primaryColor,
                  size: 36,
                ),
              ],
            ),
            onTap: () {
              if (isCurrent) {
                _togglePlay();
              } else {
                _playTrack(track);
              }
            },
          ),
        );
      },
    );
  }

  Widget _buildPlayerBar() {
    final track = _current!;
    final maxMs = _duration.inMilliseconds.toDouble();
    final posMs = _position.inMilliseconds
        .toDouble()
        .clamp(0, maxMs > 0 ? maxMs : 1)
        .toDouble();
    return Container(
      padding: EdgeInsets.fromLTRB(
        16,
        8,
        16,
        8 + MediaQuery.of(context).padding.bottom,
      ),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        boxShadow: AppTheme.softShadow(),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              const Icon(Icons.music_note_rounded, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '${track.title} · ${track.artist}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
              ),
              IconButton(
                icon: Icon(
                  _isPlaying
                      ? Icons.pause_circle_filled_rounded
                      : Icons.play_circle_fill_rounded,
                  size: 40,
                  color: AppTheme.primaryColor,
                ),
                onPressed: _togglePlay,
              ),
              IconButton(
                icon: const Icon(Icons.close_rounded),
                tooltip: '停止播放',
                onPressed: _stopAndClear,
              ),
            ],
          ),
          Row(
            children: [
              Text(_fmt(_position), style: const TextStyle(fontSize: 11)),
              Expanded(
                child: Slider(
                  value: maxMs > 0 ? posMs : 0,
                  max: maxMs > 0 ? maxMs : 1,
                  onChanged: maxMs > 0
                      ? (v) => _player.seek(
                            Duration(milliseconds: v.round()),
                          )
                      : null,
                ),
              ),
              Text(_fmt(_duration), style: const TextStyle(fontSize: 11)),
            ],
          ),
        ],
      ),
    );
  }
}