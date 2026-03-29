-- 灵犀伴学 初始化数据
-- 插入默认管理员
INSERT INTO users (username, password, email, role, nickname, created_at, updated_at)
VALUES ('admin', '$2a$10$abcdefghijklmnopqrstuv', 'admin@lingxi.com', 'parent', '管理员', datetime('now'), datetime('now'));

-- 插入示例家长
INSERT INTO users (username, password, email, role, nickname, created_at, updated_at)
VALUES ('parent1', '$2a$10$abcdefghijklmnopqrstuv', 'parent1@example.com', 'parent', '家长用户', datetime('now'), datetime('now'));

-- 插入示例孩子
INSERT INTO users (username, password, email, role, nickname, age, parent_id, created_at, updated_at)
VALUES ('child1', '$2a$10$abcdefghijklmnopqrstuv', 'child1@example.com', 'child', '小明', 4, 2, datetime('now'), datetime('now'));

-- 插入示例学习内容 (如果 contents 表存在且有数据)
-- INSERT INTO contents (title, age_range, domain, difficulty, status, created_at) VALUES...

-- 插入示例成就
INSERT INTO achievements (uuid, user_id, achievement_type, achievement_name, description, earned_at)
SELECT uuid(), 3, 'first_login', '首次登录', '第一次使用应用', datetime('now')
WHERE EXISTS (SELECT 1 FROM users WHERE id = 3);

-- 插入示例能力评估
INSERT INTO abilities (uuid, user_id, language_score, math_score, science_score, art_score, social_score, last_assessed)
SELECT uuid(), 3, 0, 0, 0, 0, 0, datetime('now')
WHERE EXISTS (SELECT 1 FROM users WHERE id = 3);