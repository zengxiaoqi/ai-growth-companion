#!/usr/bin/env python3
"""Fix _displayText to extract more fields from lesson_pack content items."""
import re

filepath = '/home/zxq/ai-growth-companion/src/frontend/lib/screens/learning/content_detail_screen.dart'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Find the exact section
marker = '// Case 2: lesson_pack'
idx = content.find(marker)
assert idx >= 0, 'Case 2 marker not found'

section_end_marker = '// Case 3: 普通列表'
end_idx = content.find(section_end_marker, idx)
assert end_idx >= 0, 'Case 3 marker not found'

# Extract the old section (exact match)
old = content[idx:end_idx + len(section_end_marker)]

new = """      // Case 2: lesson_pack { type: "lesson_pack", content: [...] }
      if (parsed is Map && parsed['content'] is List) {
        final items = parsed['content'] as List;
        final textBlocks = <String>[];
        for (final item in items) {
          if (item is Map) {
            final parts = <String>[];

            final title = item['title']?.toString() ?? '';
            if (title.isNotEmpty) parts.add('\U0001F4D6 $title');

            final poet = item['poet']?.toString() ?? '';
            if (poet.isNotEmpty) parts.add('作者：$poet');

            final text = item['text']?.toString() ?? '';
            if (text.isNotEmpty) parts.add(text);

            final content = item['content']?.toString() ?? '';
            if (content.isNotEmpty) parts.add(content);

            final meaning = item['meaning']?.toString() ?? '';
            if (meaning.isNotEmpty) parts.add('\U0001F4DD $meaning');

            final description = item['description']?.toString() ?? '';
            if (description.isNotEmpty) parts.add(description);

            final result = item['result']?.toString() ?? '';
            if (result.isNotEmpty) parts.add('\U0001F3AF 结果：$result');

            final instructions = item['instructions']?.toString() ?? '';
            if (instructions.isNotEmpty) parts.add(instructions);

            final lyrics = item['lyrics']?.toString() ?? '';
            if (lyrics.isNotEmpty) parts.add(lyrics);

            // 列表字段
            final steps = item['steps'];
            if (steps is List && steps.isNotEmpty) {
              parts.add('步骤：');
              for (var i = 0; i < steps.length; i++) {
                parts.add('  ${i + 1}. ${steps[i].toString()}');
              }
            }

            final materials = item['materials'];
            if (materials is List && materials.isNotEmpty) {
              parts.add('材料：${materials.join('、')}');
            }

            final tasks = item['tasks'];
            if (tasks is List && tasks.isNotEmpty) {
              parts.add('任务：');
              for (final t in tasks) {
                parts.add('  \\u2022 ${t.toString()}');
              }
            }

            final examples = item['examples'];
            if (examples is List && examples.isNotEmpty) {
              parts.add('示例：${examples.join('、')}');
            }

            final activities = item['activities'];
            if (activities is List && activities.isNotEmpty) {
              parts.add(activities.join('\\n'));
            }

            if (parts.isNotEmpty) {
              textBlocks.add(parts.join('\\n'));
            }
          } else if (item is String && item.isNotEmpty) {
            textBlocks.add(item);
          }
        }
        if (textBlocks.isNotEmpty) {
          return textBlocks.join('\\n\\n');
        }
      }

      // Case 3: 普通列表"""

# Verify the old section appears exactly once
count = content.count(old)
print(f'Old section occurrences: {count}')
assert count == 1, f'Expected 1 occurrence, got {count}'

content = content.replace(old, new, 1)
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done! File updated successfully.')