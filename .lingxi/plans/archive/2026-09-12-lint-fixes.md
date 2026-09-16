{
  "date": "2026-09-12",
  "source": "Autonomous evaluation pipeline v2 — daily cron",
  "suggestions": [
    {
      "id": "S1",
      "tier": 1,
      "title": "修复 video_download_provider.dart 不必要的 cast",
      "description": "4处 firstWhere with orElse returning null as VideoDownloadItem + ?.status lint 警告",
      "status": "completed",
      "action": "已移除 null cast，改用 throw StateError('not found')"
    },
    {
      "id": "S2",
      "tier": 1,
      "title": "修复 science_explore_section.dart 重复 map key",
      "description": "pitahaya/pitaya 重复键警告（两处分段），移除第二个重复项",
      "status": "completed",
      "action": "已从两处 map 中移除重复的 'pitahaya'/'pitaya' 条目"
    },
    {
      "id": "S3",
      "tier": 1,
      "title": "清理 Flutter 未使用导入和死代码",
      "description": "learning_home_screen.dart unused import; video_download_screen.dart unused field; book_skill_upload_screen.dart dead null-aware; ai_chat_screen.dart null checks",
      "status": "completed",
      "action": "已清理所有 lint 警告"
    }
  ]
}
