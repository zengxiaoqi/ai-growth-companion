-- 灵犀伴学数据库初始化脚本
-- 创建数据库: lingxi
-- 执行: psql -U postgres -d lingxi -f init.sql

-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(36) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) DEFAULT 'child' CHECK (type IN ('child', 'parent')),
    avatar VARCHAR(500),
    age SMALLINT,
    gender VARCHAR(10),
    parent_id INTEGER REFERENCES users(id),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_parent_id ON users(parent_id);

-- 创建内容表
CREATE TABLE IF NOT EXISTS contents (
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
    content JSONB NOT NULL,
    media_urls JSONB DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_contents_age_range ON contents(age_range);
CREATE INDEX idx_contents_domain ON contents(domain);
CREATE INDEX idx_contents_status ON contents(status);

-- 创建学习记录表
CREATE TABLE IF NOT EXISTS learning_records (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(36) UNIQUE NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_id INTEGER NOT NULL REFERENCES contents(id),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    duration_seconds INTEGER,
    score INTEGER,
    answers JSONB DEFAULT '[]',
    interaction_data JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_learning_user ON learning_records(user_id);
CREATE INDEX idx_learning_content ON learning_records(content_id);
CREATE INDEX idx_learning_started ON learning_records(started_at);

-- 创建能力评估表
CREATE TABLE IF NOT EXISTS ability_assessments (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(36) UNIQUE NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    domain VARCHAR(50) NOT NULL,
    score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    level VARCHAR(20),
    evidence JSONB DEFAULT '{}',
    assessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ability_user ON ability_assessments(user_id);
CREATE INDEX idx_ability_domain ON ability_assessments(domain);

-- 创建成就表
CREATE TABLE IF NOT EXISTS achievements (
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

CREATE INDEX idx_achievements_user ON achievements(user_id);

-- 创建家长控制表
CREATE TABLE IF NOT EXISTS parent_controls (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(36) UNIQUE NOT NULL,
    parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    child_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    daily_limit_minutes INTEGER DEFAULT 30,
    allowed_domains TEXT[],
    blocked_topics TEXT[],
    study_schedule JSONB DEFAULT '{}',
    notifications JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(parent_id, child_id)
);

CREATE INDEX idx_parent_parent ON parent_controls(parent_id);
CREATE INDEX idx_parent_child ON parent_controls(child_id);

-- 插入示例数据
INSERT INTO users (uuid, phone, password, name, type, age) VALUES
    (gen_random_uuid(), '13800000000', '$2b$10$abcdefghijklmnopqrstuv', '测试家长', 'parent', NULL),
    (gen_random_uuid(), '13800000001', '$2b$10$abcdefghijklmnopqrstuv', '小明', 'child', 5);

-- 插入示例内容
INSERT INTO contents (uuid, title, subtitle, age_range, domain, difficulty, duration_minutes, content_type, status) VALUES
    -- 语言领域 (Language) - 15个
    (gen_random_uuid(), '颜色宝宝', '认识红黄蓝绿', '3-4', 'language', 1, 5, 'lesson', 'published'),
    (gen_random_uuid(), '认识汉字(一)', '会认20个基础汉字', '5-6', 'language', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '汉字认知进阶', '认识50个常用汉字', '5-6', 'language', 3, 15, 'lesson', 'published'),
    (gen_random_uuid(), '拼音入门', '学会声母和韵母', '5-6', 'language', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '词汇拓展', '丰富词汇量', '5-6', 'language', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '简单句子', '会说完整句子', '3-4', 'language', 1, 5, 'lesson', 'published'),
    (gen_random_uuid(), '看图说话', '描述图片内容', '5-6', 'language', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '儿歌学语', '跟唱儿歌', '3-4', 'language', 1, 5, 'lesson', 'published'),
    (gen_random_uuid(), '故事朗读', '朗读简单故事', '5-6', 'language', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '反义词学习', '理解反义词', '5-6', 'language', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '量词认知', '会用量词', '3-4', 'language', 1, 5, 'lesson', 'published'),
    (gen_random_uuid(), '形容词丰富', '使用形容词', '5-6', 'language', 3, 10, 'lesson', 'published'),
    (gen_random_uuid(), '口语表达', '表达想法', '5-6', 'language', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '阅读理解', '理解短文', '5-6', 'language', 3, 15, 'lesson', 'published'),
    (gen_random_uuid(), '书写准备', '握笔和线条', '3-4', 'language', 1, 5, 'lesson', 'published'),

    -- 数学领域 (Math) - 15个
    (gen_random_uuid(), '数数1-5', '会数1-5个物品', '3-4', 'math', 1, 5, 'lesson', 'published'),
    (gen_random_uuid(), '10以内加法', '会做10以内加法', '5-6', 'math', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '认识数字0-10', '会认0-10', '3-4', 'math', 1, 5, 'lesson', 'published'),
    (gen_random_uuid(), '20以内加减法', '20以内加减法', '5-6', 'math', 3, 15, 'lesson', 'published'),
    (gen_random_uuid(), '认识形状', '识别基本形状', '3-4', 'math', 1, 5, 'lesson', 'published'),
    (gen_random_uuid(), '空间方位', '上下左右前后', '3-4', 'math', 1, 5, 'lesson', 'published'),
    (gen_random_uuid(), '分类与排序', '按特征分类', '3-4', 'math', 1, 5, 'lesson', 'published'),
    (gen_random_uuid(), '认识时间', '整点认识', '5-6', 'math', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '认识人民币', '识别元角分', '5-6', 'math', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '简单测量', '长短高矮', '3-4', 'math', 1, 5, 'lesson', 'published'),
    (gen_random_uuid(), '规律找规律', '找规律填数', '5-6', 'math', 3, 10, 'lesson', 'published'),
    (gen_random_uuid(), '简单统计', '统计数量', '5-6', 'math', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '钱币计算', '简单购物', '5-6', 'math', 3, 15, 'lesson', 'published'),
    (gen_random_uuid(), '分解组合', '数的分解', '5-6', 'math', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '逻辑推理', '简单推理', '5-6', 'math', 3, 15, 'lesson', 'published'),

    -- 科学领域 (Science) - 10个
    (gen_random_uuid(), '认识动物', '常见动物认知', '3-4', 'science', 1, 5, 'lesson', 'published'),
    (gen_random_uuid(), '植物生长', '植物生长过程', '5-6', 'science', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '天气认知', '晴天雨天阴天', '3-4', 'science', 1, 5, 'lesson', 'published'),
    (gen_random_uuid(), '四季变化', '春夏秋冬', '3-4', 'science', 1, 5, 'lesson', 'published'),
    (gen_random_uuid(), '自然现象', '风雨雷电', '5-6', 'science', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '人体认知', '认识身体部位', '3-4', 'science', 1, 5, 'lesson', 'published'),
    (gen_random_uuid(), '简单科学实验', '有趣的小实验', '5-6', 'science', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '物体特性', '软硬冷热', '3-4', 'science', 1, 5, 'lesson', 'published'),
    (gen_random_uuid(), '生态环境', '环保意识', '5-6', 'science', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '天文启蒙', '认识太阳月亮', '5-6', 'science', 2, 10, 'lesson', 'published'),

    -- 艺术领域 (Art) - 10个
    (gen_random_uuid(), '绘画启蒙', '自由绘画', '3-4', 'art', 1, 5, 'lesson', 'published'),
    (gen_random_uuid(), '涂色练习', '按要求涂色', '3-4', 'art', 1, 5, 'lesson', 'published'),
    (gen_random_uuid(), '折纸入门', '简单折纸', '5-6', 'art', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '音乐节奏', '打击乐器', '3-4', 'art', 1, 5, 'lesson', 'published'),
    (gen_random_uuid(), '舞蹈启蒙', '简单舞蹈动作', '3-4', 'art', 1, 5, 'lesson', 'published'),
    (gen_random_uuid(), '手工制作', '简单手工', '5-6', 'art', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '色彩搭配', '认识色彩', '5-6', 'art', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '黏土塑形', '黏土手工', '5-6', 'art', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '剪纸艺术', '简单剪纸', '5-6', 'art', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '美术欣赏', '名画欣赏', '5-6', 'art', 2, 10, 'lesson', 'published'),

    -- 社交领域 (Social) - 10个
    (gen_random_uuid(), '礼貌用语', '你好谢谢再见', '3-4', 'social', 1, 5, 'lesson', 'published'),
    (gen_random_uuid(), '自我介绍', '介绍自己', '3-4', 'social', 1, 5, 'lesson', 'published'),
    (gen_random_uuid(), '情绪认知', '识别基本情绪', '3-4', 'social', 1, 5, 'lesson', 'published'),
    (gen_random_uuid(), '社交礼仪', '与人相处', '5-6', 'social', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '合作游戏', '团队合作', '5-6', 'social', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '分享行为', '学会分享', '3-4', 'social', 1, 5, 'lesson', 'published'),
    (gen_random_uuid(), '解决问题', '遇到问题怎么办', '5-6', 'social', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '关爱他人', '关心小伙伴', '3-4', 'social', 1, 5, 'lesson', 'published'),
    (gen_random_uuid(), '时间观念', '守时习惯', '5-6', 'social', 2, 10, 'lesson', 'published'),
    (gen_random_uuid(), '规则意识', '遵守游戏规则', '5-6', 'social', 2, 10, 'lesson', 'published');