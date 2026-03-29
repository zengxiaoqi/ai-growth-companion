import { DataSource } from 'typeorm';
import { User } from '../entities/user.entity';
import { Content } from '../entities/content.entity';

export async function seedTestData(dataSource: DataSource) {
  const userRepo = dataSource.getRepository(User);
  const contentRepo = dataSource.getRepository(Content);

  // Check if data already exists
  const existingUsers = await userRepo.count();
  if (existingUsers > 0) {
    console.log('Test data already exists, skipping seed...');
    return;
  }

  // Create test users
  const parent = await userRepo.save({
    phone: '13800000001',
    password: '$2b$10$test_hash_placeholder', // In real app, hash the password
    name: '家长用户',
    type: 'parent',
    settings: { notifications: true, language: 'zh-CN' },
  });

  const child = await userRepo.save({
    phone: '13800000002',
    password: '$2b$10$test_hash_placeholder',
    name: '小明',
    type: 'child',
    age: 5,
    parentId: parent.id,
    settings: { avatar: '🐶', favoriteTopics: ['animals', 'stories'] },
  });

  console.log(`Created users: parent=${parent.id}, child=${child.id}`);

  // Create test contents
  const contents = [
    {
      uuid: 'c001',
      title: '小熊找蜂蜜',
      subtitle: '关于友谊的故事',
      ageRange: '3-4',
      domain: 'language',
      topic: 'stories',
      difficulty: 1,
      durationMinutes: 10,
      contentType: 'story',
      content: { text: '从前有一只小熊...' },
      mediaUrls: [],
      status: 'published',
    },
    {
      uuid: 'c002',
      title: '认识数字 1-10',
      subtitle: '基础数学启蒙',
      ageRange: '3-4',
      domain: 'math',
      topic: 'numbers',
      difficulty: 1,
      durationMinutes: 15,
      contentType: 'lesson',
      content: { exercises: [] },
      mediaUrls: [],
      status: 'published',
    },
    {
      uuid: 'c003',
      title: '动物叫声配对',
      subtitle: '认识动物',
      ageRange: '3-4',
      domain: 'science',
      topic: 'animals',
      difficulty: 1,
      durationMinutes: 8,
      contentType: 'game',
      content: { pairs: [] },
      mediaUrls: [],
      status: 'published',
    },
  ];

  for (const content of contents) {
    await contentRepo.save(content);
  }

  console.log(`Created ${contents.length} test contents`);
  console.log('✅ Seed completed!');
}