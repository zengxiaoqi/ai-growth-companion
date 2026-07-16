/**
 * 诗词数据导入脚本
 * 用法: node scripts/import-poetry-data.js [json-file-path]
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('better-sqlite3');

// 默认数据库路径
const DB_PATH = path.join(__dirname, '../src/backend/lingxi.db');
const DEFAULT_DATA_PATH = path.join(__dirname, '../data/poetry.json');

/**
 * 推断诗词类型
 */
function inferType(content, title) {
  if (!content || !Array.isArray(content)) return null;
  
  const lines = content.filter(l => l && l.trim().length > 0);
  const lineCount = lines.length;
  
  // 根据标题关键词判断
  if (title) {
    if (title.includes('·') && !title.includes('，')) {
      // 词的格式：如 "水调歌头·明月几时有"
      return '词';
    }
  }
  
  // 根据行数判断
  if (lineCount === 4) {
    const avgChars = lines.reduce((sum, l) => sum + l.length, 0) / lineCount;
    if (avgChars <= 6) return '五言绝句';
    if (avgChars <= 8) return '七言绝句';
  }
  if (lineCount === 8) {
    const avgChars = lines.reduce((sum, l) => sum + l.length, 0) / lineCount;
    if (avgChars <= 6) return '五言律诗';
    if (avgChars <= 8) return '七言律诗';
  }
  
  return '其他';
}

/**
 * 获取首字
 */
function getFirstChar(content) {
  if (!content || !Array.isArray(content) || content.length === 0) return null;
  const firstLine = content[0];
  if (!firstLine || firstLine.length === 0) return null;
  return firstLine[0];
}

/**
 * 导入数据
 */
async function importData(dataPath) {
  console.log(`📖 开始导入诗词数据...`);
  console.log(`数据库: ${DB_PATH}`);
  console.log(`数据源: ${dataPath}`);
  
  // 读取数据
  if (!fs.existsSync(dataPath)) {
    console.error(`❌ 数据文件不存在: ${dataPath}`);
    process.exit(1);
  }
  
  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const poems = JSON.parse(rawData);
  
  console.log(`📊 读取到 ${poems.length} 首诗词`);
  
  // 连接数据库
  const db = new sqlite3(DB_PATH);
  
  // 创建表
  db.exec(`
    CREATE TABLE IF NOT EXISTS poems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title VARCHAR(200) NOT NULL,
      author VARCHAR(100) NOT NULL,
      dynasty VARCHAR(20) NOT NULL,
      type VARCHAR(50),
      content TEXT,
      translation VARCHAR(500),
      appreciation VARCHAR(1000),
      popularity INTEGER DEFAULT 0,
      firstChar VARCHAR(20)
    );
    
    CREATE INDEX IF NOT EXISTS idx_poems_title ON poems(title);
    CREATE INDEX IF NOT EXISTS idx_poems_author ON poems(author);
    CREATE INDEX IF NOT EXISTS idx_poems_dynasty ON poems(dynasty);
    CREATE INDEX IF NOT EXISTS idx_poems_type ON poems(type);
    CREATE INDEX IF NOT EXISTS idx_poems_firstChar ON poems(firstChar);
    CREATE INDEX IF NOT EXISTS idx_poems_popularity ON poems(popularity);
  `);
  
  // 清空旧数据
  const deleteResult = db.prepare('DELETE FROM poems').run();
  console.log(`🗑️  清空旧数据: ${deleteResult.changes} 条`);
  
  // 批量插入
  const insert = db.prepare(`
    INSERT INTO poems (title, author, dynasty, type, content, translation, appreciation, popularity, firstChar)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  let successCount = 0;
  let errorCount = 0;
  
  const insertMany = db.transaction((poems) => {
    for (const poem of poems) {
      try {
        const contentStr = JSON.stringify(poem.content || []);
        const type = poem.type || inferType(poem.content, poem.title);
        const firstChar = getFirstChar(poem.content);
        
        insert.run(
          poem.title || '无题',
          poem.author || '佚名',
          poem.dynasty || '未知',
          type,
          contentStr,
          poem.translation || null,
          poem.appreciation || null,
          poem.popularity || 0,
          firstChar
        );
        successCount++;
      } catch (err) {
        errorCount++;
        if (errorCount <= 10) {
          console.error(`⚠️  导入失败: ${poem.title} - ${err.message}`);
        }
      }
    }
  });
  
  console.log(`⏳ 正在导入...`);
  insertMany(poems);
  
  // 统计
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      COUNT(DISTINCT author) as authors,
      COUNT(DISTINCT dynasty) as dynasties
    FROM poems
  `).get();
  
  console.log(`\n✅ 导入完成!`);
  console.log(`   成功: ${successCount} 首`);
  console.log(`   失败: ${errorCount} 首`);
  console.log(`   总计: ${stats.total} 首`);
  console.log(`   作者: ${stats.authors} 人`);
  console.log(`   朝代: ${stats.dynasties} 个`);
  
  // 按朝代统计
  const dynastyStats = db.prepare(`
    SELECT dynasty, COUNT(*) as count
    FROM poems
    GROUP BY dynasty
    ORDER BY count DESC
    LIMIT 10
  `).all();
  
  console.log(`\n📊 朝代分布 (Top 10):`);
  dynastyStats.forEach(s => {
    console.log(`   ${s.dynasty}: ${s.count} 首`);
  });
  
  db.close();
}

// 主程序
const dataPath = process.argv[2] || DEFAULT_DATA_PATH;
importData(dataPath).catch(err => {
  console.error('❌ 导入失败:', err);
  process.exit(1);
});
