// 知识书管理 — 家长上传、查看、删除知识书
// 家长可以上传 PDF/EPUB/DOCX/TXT 等书籍文件，系统自动提取内容生成结构化知识

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'dart:html' as html;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:file_picker/file_picker.dart';
import '../../services/api_service.dart';
import '../../providers/user_provider.dart';
import '../../theme/app_theme.dart';

class BookSkillUploadScreen extends StatefulWidget {
  const BookSkillUploadScreen({super.key});

  @override
  State<BookSkillUploadScreen> createState() => _BookSkillUploadScreenState();
}

class _BookSkillUploadScreenState extends State<BookSkillUploadScreen> {
  final _api = ApiService();
  List<Map<String, dynamic>> _books = [];
  bool _loading = true;
  bool _uploading = false;

  @override
  void initState() {
    super.initState();
    _loadBooks();
  }

  Future<void> _loadBooks() async {
    setState(() => _loading = true);
    try {
      final data = await _api.get('/book-skill/list');
      final list = data?['items'] as List? ?? data as List? ?? [];
      setState(() => _books = list.cast<Map<String, dynamic>>());
    } catch (e) {
      debugPrint('Failed to load books: $e');
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _pickAndUpload() async {
    try {
      if (kIsWeb) {
        await _pickAndUploadWeb();
      } else {
        await _pickAndUploadNative();
      }
    } catch (e) {
      if (mounted) _showSnack('操作失败: $e');
    }
  }

  /// Web 文件选择：使用 dart:html FileUploadInputElement
  Future<void> _pickAndUploadWeb() async {
    final completer = Completer<void>();
    final input = html.FileUploadInputElement()
      ..accept = '.pdf,.epub,.docx,.txt,.md,.rtf'
      ..multiple = false;
    input.click();
    input.onChange.listen((_) async {
      final files = input.files;
      if (files == null || files.isEmpty) {
        completer.complete();
        return;
      }
      final file = files[0];
      final reader = html.FileReader();
      reader.readAsArrayBuffer(file);
      reader.onLoadEnd.listen((_) async {
        setState(() => _uploading = true);
        try {
          final bytes = reader.result as Uint8List;
          String title = (file.name ?? '').replaceAll(RegExp(r'\.[^.]+$'), '');
          if (title.isEmpty) title = '未命名';
          await _api.uploadFile(
            '/book-skill/upload',
            '',
            file.name ?? 'file',
            fileBytes: bytes,
            fields: {'title': title},
          );
          if (mounted) {
            _showSnack('上传成功，正在提取内容...');
            await _loadBooks();
          }
        } catch (e) {
          if (mounted) _showSnack('上传失败: $e');
        } finally {
          if (mounted) setState(() => _uploading = false);
        }
        completer.complete();
      });
    });
    return completer.future;
  }

  /// Native 文件选择
  Future<void> _pickAndUploadNative() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'epub', 'docx', 'txt', 'md', 'rtf'],
      allowMultiple: false,
    );

    if (result == null || result.files.isEmpty) return;

    final file = result.files.first;
    if (file.path == null) {
      if (mounted) _showSnack('无法读取文件');
      return;
    }

    setState(() => _uploading = true);

    try {
      String title = file.name.replaceAll(RegExp(r'\.[^.]+$'), '');
      if (title.isEmpty) title = '未命名';
      await _api.uploadFile('/book-skill/upload', file.path!, file.name, fields: {'title': title});
      if (mounted) {
        _showSnack('上传成功，正在提取内容...');
        await _loadBooks();
      }
    } catch (e) {
      if (mounted) _showSnack('上传失败: $e');
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _deleteBook(int id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('确认删除'),
        content: const Text('删除后无法恢复，确定要删除这本知识书吗？'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('删除', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await _api.delete('/book-skill/$id');
      _showSnack('已删除');
      _loadBooks();
    } catch (e) {
      _showSnack('删除失败: $e');
    }
  }

  void _showSnack(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'ready':
        return Colors.green;
      case 'processing':
        return Colors.orange;
      case 'failed':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'ready':
        return '就绪';
      case 'processing':
        return '处理中...';
      case 'failed':
        return '失败';
      default:
        return status;
    }
  }

  IconData _fileIcon(String fileType) {
    switch (fileType) {
      case 'pdf':
        return Icons.picture_as_pdf;
      case 'epub':
        return Icons.book;
      case 'docx':
        return Icons.description;
      default:
        return Icons.article;
    }
  }

  String _formatSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('知识书'),
        actions: [
          if (_uploading)
            const Padding(
              padding: EdgeInsets.all(12),
              child: SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
              ),
            )
          else
            IconButton(
              icon: const Icon(Icons.add),
              tooltip: '上传书籍',
              onPressed: _uploading ? null : _pickAndUpload,
            ),
        ],
      ),
      body: _loading
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
                        '点击右上角 + 上传 PDF/EPUB/DOCX 书籍',
                        style: TextStyle(fontSize: 14, color: Colors.grey[400]),
                      ),
                      const SizedBox(height: 24),
                      ElevatedButton.icon(
                        onPressed: _pickAndUpload,
                        icon: const Icon(Icons.cloud_upload_outlined),
                        label: const Text('上传书籍'),
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
                      final status = book['status'] as String? ?? 'processing';
                      final fileType = book['fileType'] as String? ?? 'pdf';
                      final fileSize = book['fileSize'] as int? ?? 0;
                      final chapters = book['totalChapters'] as int? ?? 0;

                      return Card(
                        margin: const EdgeInsets.only(bottom: 12),
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: AppTheme.primaryColor.withOpacity(0.1),
                            child: Icon(_fileIcon(fileType), color: AppTheme.primaryColor),
                          ),
                          title: Text(
                            book['title'] as String? ?? '未命名',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          subtitle: Text(
                            '${_formatSize(fileSize)} · ${chapters > 0 ? "$chapters 章" : ""} · ${_statusLabel(status)}',
                            style: TextStyle(color: _statusColor(status)),
                          ),
                          trailing: PopupMenuButton<String>(
                            onSelected: (value) {
                              if (value == 'delete') {
                                _deleteBook(book['id'] as int);
                              }
                            },
                            itemBuilder: (ctx) => [
                              const PopupMenuItem(value: 'delete', child: Text('删除')),
                            ],
                          ),
                          onTap: () {
                            // Navigate to book detail (child view)
                            Navigator.pushNamed(context, '/book-skill/detail', arguments: {
                              'bookId': book['id'],
                            });
                          },
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}