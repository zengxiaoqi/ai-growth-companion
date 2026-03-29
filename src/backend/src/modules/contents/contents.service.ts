import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Content } from '../../database/entities/content.entity';

@Injectable()
export class ContentsService {
  constructor(
    @InjectRepository(Content)
    private contentsRepository: Repository<Content>,
  ) {}

  async findAll(query: any = {}) {
    const { ageRange, domain, page = 1, limit = 20 } = query;
    const where: any = { status: 'published' };
    if (ageRange) where.ageRange = ageRange;
    if (domain) where.domain = domain;

    const [list, total] = await this.contentsRepository.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { id: 'DESC' },
    });

    return { list, total, page, limit };
  }

  async findById(id: number) {
    return this.contentsRepository.findOne({ where: { id } });
  }

  async create(data: Partial<Content>) {
    const content = this.contentsRepository.create(data);
    return this.contentsRepository.save(content);
  }
}