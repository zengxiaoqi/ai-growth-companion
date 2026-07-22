#!/usr/bin/env python3
"""一次性导入 src/content/ 下的 JSON 课程文件到数据库。

用法:
  cd src/backend && python3 scripts/import-content-json.py

执行后 47 个课程文件（3-4岁 18个，5-6岁 29个）
将被导入到 lingxi.db 的 contents 表。
"""
import sqlite3
import json
import os
import sys
import uuid
from datetime import datetime

CONTENT_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'content')
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'lingxi.db')

# 域映射表
DOMAIN_LABELS = {
    'language': '语言',
    'math': '数学',
    'science': '科学',
    'art': '艺术',
    'social': '社会情感',
}

def import_lesson(conn, filepath, basename, age_range):
    """导入一个 JSON 课程文件到 contents 表"""
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    domain = data.get('domain', 'language')
    name = data.get('name', basename)
    difficulty = data.get('difficulty', 1)
    duration = data.get('duration', 5)
    content_id = data.get('id', f'{age_range}_{basename}')

    # 检查是否已导入（通过 uuid 字段去重，使用 content_id 作为 uuid）
    existing = conn.execute(
        'SELECT id FROM contents WHERE uuid = ?', (content_id,)
    ).fetchone()
    if existing:
        print(f'  ⏭ 跳过已存在: {basename} (uuid={content_id})')
        return False

    title = name
    subtitle = f'{DOMAIN_LABELS.get(domain, domain)} · {age_range}岁'

    # 将 content 数组序列化为 JSON 字符串
    content_json = json.dumps(data.get('content', []), ensure_ascii=False)
    media = data.get('media', {})
    media_urls = json.dumps(media, ensure_ascii=False)

    # 生成 objectives 描述
    objectives = data.get('objectives', [])
    content_obj = {
        'type': 'lesson_pack',
        'version': 1,
        'objectives': objectives,
        'content': data.get('content', []),
        'media': media,
    }

    conn.execute(
        '''INSERT INTO contents
           (uuid, title, subtitle, ageRange, domain, topic, difficulty,
            durationMinutes, contentType, content, mediaUrls, status, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', datetime('now'), datetime('now'))''',
        (
            content_id,
            title,
            subtitle,
            age_range,
            domain,
            domain,  # topic 暂用 domain
            difficulty,
            duration,
            'lesson_pack',
            json.dumps(content_obj, ensure_ascii=False),
            media_urls,
        )
    )
    print(f'  ✅ 导入: {basename} → {title} ({domain})')
    return True


def main():
    if not os.path.exists(DB_PATH):
        print(f'❌ 数据库不存在: {DB_PATH}')
        print('   请先启动后端一次（npm run start:dev）生成数据库再运行此脚本')
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    conn.execute('PRAGMA journal_mode=WAL')

    # 检查 contents 表是否有 uuid 列
    cols = [row[1] for row in conn.execute('PRAGMA table_info(contents)').fetchall()]
    if 'uuid' not in cols:
        print('❌ contents 表缺少 uuid 列，请确认数据库版本正确')
        conn.close()
        sys.exit(1)

    total_imported = 0
    total_skipped = 0

    age_dirs = [
        ('3-4-years', '3-4'),
        ('5-6-years', '5-6'),
    ]

    for dirname, age_range in age_dirs:
        dirpath = os.path.join(CONTENT_DIR, dirname)
        if not os.path.isdir(dirpath):
            print(f'⚠ 目录不存在: {dirpath}')
            continue

        json_files = sorted([f for f in os.listdir(dirpath) if f.endswith('.json')])
        print(f'\n📂 {dirname}/ ({age_range}岁) — {len(json_files)} 个文件')

        for filename in json_files:
            filepath = os.path.join(dirpath, filename)
            try:
                if import_lesson(conn, filepath, filename, age_range):
                    total_imported += 1
                else:
                    total_skipped += 1
            except Exception as e:
                print(f'  ❌ 失败: {filename} — {e}')

    conn.commit()
    conn.close()

    print('\n' + '='*50)
    print(f'📊 导入完成: 新增 {total_imported} 个课程, 跳过 {total_skipped} 个（已存在）')
    print(f'📦 数据库: {DB_PATH}')

    # 验证最终数据
    conn2 = sqlite3.connect(DB_PATH)
    total = conn2.execute('SELECT COUNT(*) FROM contents').fetchone()[0]
    by_domain = conn2.execute(
        'SELECT domain, COUNT(*) FROM contents GROUP BY domain ORDER BY domain'
    ).fetchall()
    by_age = conn2.execute(
        'SELECT ageRange, COUNT(*) FROM contents GROUP BY ageRange ORDER BY ageRange'
    ).fetchall()
    conn2.close()

    print(f'\n📋 最终 contents 表: {total} 条记录')
    for domain, cnt in by_domain:
        label = DOMAIN_LABELS.get(domain, domain)
        print(f'   {label:8s} ({domain:12s}): {cnt} 个')
    print(f'\n📋 按年龄:')
    for age, cnt in by_age:
        print(f'   {age:6s}: {cnt} 个')

if __name__ == '__main__':
    main()