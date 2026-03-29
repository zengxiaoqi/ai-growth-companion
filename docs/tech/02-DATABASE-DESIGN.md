# 数据库设计

**项目**: 灵犀伴学  
**日期**: 2026-03-12  
**设计师**: 灵犀

---

## 数据库概览

### 技术选型
- **主数据库**: PostgreSQL
- **缓存**: Redis
- **对象存储**: 阿里云 OSS (图片/音频/视频)

---

## 核心数据表

### 1. users - 用户表

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  uuid VARCHAR(36) UNIQUE NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('child', 'parent')),
  name VARCHAR(100),
  avatar VARCHAR(500),
  age SMALLINT, -- 孩子年龄
  gender VARCHAR(10),
  parent_id INTEGER REFERENCES users(id), -- 关联的家长
  settings JSONB DEFAULT '{}', -- 用户设置
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX idx_users_uuid ON users(uuid);
CREATE INDEX idx_users_parent_id ON users(parent_id);
CREATE INDEX idx_users_type ON users(type);
```

### 2. contents - 内容表

```sql
CREATE TABLE contents (
  id SERIAL PRIMARY KEY,
  uuid VARCHAR(36) UNIQUE NOT NULL,
  title VARCHAR(200) NOT NULL,
  subtitle VARCHAR(500),
  age_range VARCHAR(20) CHECK (age_range IN ('3-4', '5-6', 'all')),
  domain VARCHAR(50) CHECK (domain IN ('language', 'math', 'science', 'art', 'social')),
  topic VARCHAR(100),
  difficulty INTEGER DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  duration_minutes INTEGER DEFAULT 5,
  content_type VARCHAR(50) CHECK (content_type IN ('story', 'lesson', 'game', 'quiz', 'video')),
  content JSONB NOT NULL, -- 完整内容 JSON
  media_urls JSONB DEFAULT '[]', -- 图片/音频/视频 URL
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_contents_age_range ON contents(age_range);
CREATE INDEX idx_contents_domain ON contents(domain);
CREATE INDEX idx_contents_status ON contents(status);
CREATE INDEX idx_contents_topic ON contents(topic);
```

### 3. learning_records - 学习记录表

```sql
CREATE TABLE learning_records (
  id SERIAL PRIMARY KEY,
  uuid VARCHAR(36) UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id INTEGER NOT NULL REFERENCES contents(id),
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  duration_seconds INTEGER, -- 实际学习时长
  score INTEGER, -- 答题得分
  answers JSONB DEFAULT '[]', -- 答题详情
  interaction_data JSONB DEFAULT '{}', -- 互动数据
  status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_learning_records_user_id ON learning_records(user_id);
CREATE INDEX idx_learning_records_content_id ON learning_records(content_id);
CREATE INDEX idx_learning_records_started_at ON learning_records(started_at);
```

### 4. ability_assessments - 能力评估表

```sql
CREATE TABLE ability_assessments (
  id SERIAL PRIMARY KEY,
  uuid VARCHAR(36) UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain VARCHAR(50) NOT NULL, -- language/math/science/art/social
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  level VARCHAR(20), -- beginner/intermediate/advanced
  evidence JSONB DEFAULT '{}', -- 评估依据
  assessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ability_assessments_user_id ON ability_assessments(user_id);
CREATE INDEX idx_ability_assessments_domain ON ability_assessments(domain);
CREATE INDEX idx_ability_assessments_assessed_at ON ability_assessments(assessed_at);
```

### 5. achievements - 成就表

```sql
CREATE TABLE achievements (
  id SERIAL PRIMARY KEY,
  uuid VARCHAR(36) UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_type VARCHAR(50) NOT NULL,
  achievement_name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(200),
  earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_achievements_user_id ON achievements(user_id);
CREATE INDEX idx_achievements_type ON achievements(achievement_type);
```

### 6. ai_conversations - AI 对话记录

```sql
CREATE TABLE ai_conversations (
  id SERIAL PRIMARY KEY,
  uuid VARCHAR(36) UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  messages JSONB DEFAULT '[]', -- 对话历史
  context JSONB DEFAULT '{}', -- 上下文（学习进度、兴趣等）
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  duration_seconds INTEGER,
  feedback INTEGER, -- 用户满意度 1-5
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_conversations_user_id ON ai_conversations(user_id);
CREATE INDEX idx_ai_conversations_started_at ON ai_conversations(started_at);
```

### 7. parent_controls - 家长控制设置

```sql
CREATE TABLE parent_controls (
  id SERIAL PRIMARY KEY,
  uuid VARCHAR(36) UNIQUE NOT NULL,
  parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  daily_limit_minutes INTEGER DEFAULT 30, -- 每日时长限制
  allowed_domains TEXT[], -- 允许的学科
  blocked_topics TEXT[], -- 屏蔽的主题
  study_schedule JSONB DEFAULT '{}', -- 学习时间安排
  notifications JSONB DEFAULT '{}', -- 通知设置
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(parent_id, child_id)
);

CREATE INDEX idx_parent_controls_parent_id ON parent_controls(parent_id);
CREATE INDEX idx_parent_controls_child_id ON parent_controls(child_id);
```

---

## Redis 缓存设计

### Session 缓存
```
Key: session:{user_uuid}
Value: { user_id, token, expires_at }
TTL: 7 days
```

### 学习进度缓存
```
Key: progress:{user_id}:{date}
Value: { today_learning_minutes, contents_completed }
TTL: 1 day
```

### AI 对话上下文缓存
```
Key: context:{conversation_id}
Value: { messages, context }
TTL: 1 hour
```

---

## 索引优化建议

### 高频查询索引
1. `learning_records(user_id, started_at)` - 用户学习历史
2. `contents(age_range, domain, status)` - 内容推荐查询
3. `ability_assessments(user_id, domain, assessed_at)` - 能力趋势

### 复合索引
- `(user_id, status)` - 用户学习状态
- `(content_id, status)` - 内容完成情况

---

## 数据迁移策略

- 使用 Alembic (Python) 或 TypeORM Migration
- 每次 schema 变更创建 migration 文件
- 生产环境: 夜间低峰期执行

---

*设计完成 - 2026-03-12*