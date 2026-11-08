/**
 * 诗词数据库导入脚本（独立 poetry.db 版）
 *
 * 背景：poetry 模块使用独立的只读外部 SQLite（POETRY_DB_PATH，默认 src/backend/poetry.db），
 * 三表 schema（poems/authors/dynasties，见 src/modules/poetry/entities/*.entity.ts）。
 * 旧版 scripts/import-poetry-data.js 面向旧单表 schema 且依赖 better-sqlite3
 * （本机原生绑定损坏不可用），故本脚本改用 sql.js 纯 JS 实现。
 *
 * 用法: node scripts/import-poetry-db.js [json路径] [输出db路径]
 * 默认: data/poetry.json → src/backend/poetry.db
 */
const fs = require('fs');
const path = require('path');
// sql.js 装在 src/backend 下（主库驱动），从那里解析
const { createRequire } = require('module');
const backendRequire = createRequire(path.join(__dirname, '..', 'src', 'backend', 'package.json'));
const initSqlJs = backendRequire('sql.js');

const ROOT = path.join(__dirname, '..');
const DATA_PATH = process.argv[2] || path.join(ROOT, 'data', 'poetry.json');
const DB_PATH = process.argv[3] || path.join(ROOT, 'src', 'backend', 'poetry.db');

/** 推断诗词类型（与旧脚本一致） */
function inferType(content, title) {
  if (!content || !Array.isArray(content)) return null;
  const lines = content.filter((l) => l && l.trim().length > 0);
  if (title && title.includes('·') && !title.includes('，')) return '词';
  if (lines.length === 4) {
    const avg = lines.reduce((s, l) => s + l.length, 0) / lines.length;
    if (avg <= 6) return '五言绝句';
    if (avg <= 8) return '七言绝句';
  }
  if (lines.length === 8) {
    const avg = lines.reduce((s, l) => s + l.length, 0) / lines.length;
    if (avg <= 6) return '五言律诗';
    if (avg <= 8) return '七言律诗';
  }
  return '其他';
}

async function main() {
  if (!fs.existsSync(DATA_PATH)) {
    console.error(`❌ 数据文件不存在: ${DATA_PATH}`);
    process.exit(1);
  }
  console.log(`📖 读取 ${DATA_PATH} ...`);
  const poems = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  console.log(`📊 共 ${poems.length} 首诗词`);

  const SQL = await initSqlJs();
  const db = new SQL.Database();

  db.exec(`
    CREATE TABLE dynasties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(50) NOT NULL,
      name_zh_hant VARCHAR(50),
      sort_order INTEGER
    );
    CREATE TABLE authors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(100) NOT NULL,
      name_zh_hant VARCHAR(100),
      dynasty_id INTEGER
    );
    CREATE TABLE poems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title VARCHAR(200) NOT NULL,
      content TEXT,
      author_id INTEGER,
      dynasty_id INTEGER,
      type VARCHAR(50),
      title_zh_hant VARCHAR(200),
      content_zh_hant TEXT
    );
    CREATE INDEX idx_poems_title ON poems(title);
    CREATE INDEX idx_poems_type ON poems(type);
    CREATE INDEX idx_poems_author_id ON poems(author_id);
    CREATE INDEX idx_poems_dynasty_id ON poems(dynasty_id);
    CREATE INDEX idx_authors_name ON authors(name);
    CREATE INDEX idx_dynasties_name ON dynasties(name);
  `);

  db.exec('BEGIN');
  const insDynasty = db.prepare('INSERT INTO dynasties (name, sort_order) VALUES (?, ?)');
  const insAuthor = db.prepare('INSERT INTO authors (name, dynasty_id) VALUES (?, ?)');
  const insPoem = db.prepare(
    'INSERT INTO poems (title, content, author_id, dynasty_id, type) VALUES (?, ?, ?, ?, ?)'
  );

  // 朝代去重（按首次出现排序）
  const dynastyIds = new Map();
  // 作者去重（同一作者可能跨朝代记录，键 = 名字+朝代；查询按 name LIKE，取首个 id 即可）
  const authorIds = new Map();

  let poemOk = 0;
  for (const p of poems) {
    if (!p || !p.title) continue;
    const dynastyName = (p.dynasty || '').trim() || null;
    if (dynastyName && !dynastyIds.has(dynastyName)) {
      insDynasty.run([dynastyName, dynastyIds.size]);
      dynastyIds.set(dynastyName, dynastyIds.size + 1);
    }
    const dynastyId = dynastyName ? dynastyIds.get(dynastyName) || null : null;

    const authorName = (p.author || '').trim() || null;
    let authorId = null;
    if (authorName) {
      const key = authorName + '|' + (dynastyName || '');
      if (!authorIds.has(key)) {
        insAuthor.run([authorName, dynastyId]);
        authorIds.set(key, authorIds.size + 1);
      }
      authorId = authorIds.get(key);
    }

    const lines = Array.isArray(p.content) ? p.content : p.content ? [p.content] : [];
    const type = p.type || inferType(lines, p.title);
    insPoem.run([p.title, JSON.stringify(lines), authorId, dynastyId, type]);
    poemOk++;
  }
  db.exec('COMMIT');

  console.log(`✅ 写入: poems=${poemOk}, authors=${authorIds.size}, dynasties=${dynastyIds.size}`);

  const out = Buffer.from(db.export());
  fs.writeFileSync(DB_PATH, out);
  console.log(`💾 已生成 ${DB_PATH}（${(out.length / 1024 / 1024).toFixed(1)} MB）`);

  // 抽样验证
  db.exec('SELECT id, title, type FROM poems ORDER BY id LIMIT 3');
  const check = db.exec('SELECT COUNT(*) FROM poems');
  console.log(`🔍 复核 poems 行数: ${check[0].values[0][0]}`);
}

main().catch((e) => {
  console.error('❌ 导入失败:', e);
  process.exit(1);
});
