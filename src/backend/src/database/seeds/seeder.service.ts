import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { User } from '../entities/user.entity';
import { Content } from '../entities/content.entity';

const DOMAIN_LABELS: Record<string, string> = {
  language: '语言',
  math: '数学',
  science: '科学',
  art: '艺术',
  social: '社会情感',
};

const LEGACY_PLACEHOLDER_UUIDS = [
  'c101', 'c102', 'c103', 'c104', 'c105', 'c106',
  'c201', 'c202', 'c203', 'c204', 'c205', 'c206',
];

@Injectable()
export class DatabaseSeederService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Content)
    private contentRepository: Repository<Content>,
  ) {}

  async onModuleInit() {
    await this.seed();
  }

  async seed() {
    const userCount = await this.userRepository.count();
    if (userCount > 0) {
      console.log('Database already has data, skipping user seed...');
    } else if (process.env.NODE_ENV === 'production') {
      // The demo accounts below use the well-known password `password123`, which
      // is documented in this (public) repository. Never create them on a
      // production database — that would hand anyone a working parent account.
      console.log('Production detected: skipping demo user seeding.');
    } else {
      await this.seedUsers();
    }

    await this.syncContents();
    console.log('✅ Database seed completed!');
  }

  private async seedUsers() {
    const hashedPassword = await bcrypt.hash('password123', 10);

    const parent = await this.userRepository.save({
      phone: '13800000001',
      password: hashedPassword,
      name: '家长用户',
      type: 'parent',
      settings: { notifications: true, language: 'zh-CN' },
    });

    await this.userRepository.save({
      phone: '13800000002',
      password: hashedPassword,
      name: '小明',
      type: 'child',
      age: 5,
      parentId: parent.id,
      settings: { avatar: '🐶', favoriteTopics: ['animals', 'stories'] },
    });

    console.log(`Created 2 test users (parent id=${parent.id})`);
  }

  private resolveContentDir(): string | null {
    const candidates = [
      process.env.CONTENT_DIR,
      path.resolve(__dirname, '../../../../content'),
      path.resolve(process.cwd(), '../content'),
      path.resolve(process.cwd(), 'src/content'),
    ].filter(Boolean) as string[];
    for (const dir of candidates) {
      if (fs.existsSync(path.join(dir, '3-4-years'))) return dir;
    }
    return null;
  }

  private async syncContents() {
    const dir = this.resolveContentDir();
    if (!dir) {
      console.warn('src/content directory not found, skipping course sync.');
      return;
    }

    let inserted = 0;
    let updated = 0;
    const seen = new Set<string>();

    for (const [sub, ageRange] of [
      ['3-4-years', '3-4'],
      ['5-6-years', '5-6'],
    ] as const) {
      const folder = path.join(dir, sub);
      if (!fs.existsSync(folder)) continue;

      for (const file of fs.readdirSync(folder).filter((f) => f.endsWith('.json')).sort()) {
        let data: any;
        try {
          data = JSON.parse(fs.readFileSync(path.join(folder, file), 'utf-8'));
        } catch (e) {
          console.warn(`Skip ${file}: invalid JSON (${e})`);
          continue;
        }

        const uuid = String(data.id ?? '');
        if (!uuid || uuid.length > 36 || seen.has(uuid)) {
          console.warn(`Skip ${file}: missing or duplicate id "${uuid}"`);
          continue;
        }
        seen.add(uuid);

        const domain = data.domain ?? 'language';
        const payload = {
          uuid,
          title: data.name ?? file.replace(/\.json$/, ''),
          subtitle: `${DOMAIN_LABELS[domain] ?? domain} · ${ageRange}岁`,
          ageRange,
          domain,
          topic: file.replace(/^\d+-/, '').replace(/\.json$/, ''),
          difficulty: data.difficulty ?? 1,
          durationMinutes: data.duration ?? 5,
          contentType: 'lesson_pack',
          // simple-json column serializes once; pass the object, never a string
          content: {
            type: 'lesson_pack',
            version: 1,
            objectives: data.objectives ?? [],
            content: data.content ?? [],
            ...(data.visualStory ? { visualStory: data.visualStory } : {}),
            ...(data.videoLesson ? { videoLesson: data.videoLesson } : {}),
          },
          mediaUrls: [],
          status: 'published',
        };

        const existing = await this.contentRepository.findOne({ where: { uuid } });
        if (existing) {
          await this.contentRepository.save({ ...existing, ...payload, id: existing.id });
          updated++;
        } else {
          await this.contentRepository.save(payload);
          inserted++;
        }
      }
    }

    await this.contentRepository.update(
      { uuid: In(LEGACY_PLACEHOLDER_UUIDS), status: 'published' },
      { status: 'draft' },
    );

    console.log(
      `Synced lesson packs from src/content (inserted ${inserted}, updated ${updated}); legacy placeholders drafted.`,
    );
  }
}
