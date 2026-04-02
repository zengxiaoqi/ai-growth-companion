import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ParentControl } from '../../database/entities/parent-control.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ParentService {
  constructor(
    @InjectRepository(ParentControl)
    private controlRepository: Repository<ParentControl>,
  ) {}

  async getByParent(parentId: number) {
    const controls = await this.controlRepository.find({ where: { parentId } });
    // Return the first control if exists, otherwise create a default one
    if (controls.length > 0) return controls[0];

    // Return a default control object
    return {
      id: 0,
      parentId,
      dailyLimitMinutes: 30,
      allowedDomains: ['language', 'math', 'science', 'art', 'social'],
      blockedTopics: [],
      studySchedule: null,
      notifications: null,
      eyeProtectionEnabled: true,
      restReminderMinutes: 20,
      contentFilterEnabled: true,
    };
  }

  async getByChild(childId: number) {
    return this.controlRepository.findOne({ where: { childId } });
  }

  async create(parentId: number, childId: number) {
    const existing = await this.controlRepository.findOne({
      where: { parentId, childId },
    });
    if (existing) return existing;

    const control = this.controlRepository.create({
      uuid: uuidv4(),
      parentId,
      childId,
      studySchedule: '{}',
      notifications: '{}',
    });
    return this.controlRepository.save(control);
  }

  async createWithDefaults(parentId: number) {
    // Check if any control exists for this parent
    const existing = await this.controlRepository.findOne({ where: { parentId } });
    if (existing) return existing;

    const control = this.controlRepository.create({
      uuid: uuidv4(),
      parentId,
      childId: 0,
      studySchedule: '{}',
      notifications: '{}',
    });
    return this.controlRepository.save(control);
  }

  async update(id: number, data: Partial<ParentControl>) {
    await this.controlRepository.update(id, data);
    const control = await this.controlRepository.findOne({ where: { id } });
    if (!control) throw new NotFoundException('设置不存在');
    return control;
  }
}