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
    return this.controlRepository.find({ where: { parentId } });
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