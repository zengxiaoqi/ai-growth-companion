import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Content } from '../../database/entities/content.entity';
import { ParentControl } from '../../database/entities/parent-control.entity';

@Injectable()
export class ContentsService {
  constructor(
    @InjectRepository(Content)
    private contentsRepository: Repository<Content>,
    @InjectRepository(ParentControl)
    private controlRepository: Repository<ParentControl>,
  ) {}

  async findAll(query: any = {}) {
    const { ageRange, domain, page = 1, limit = 20, childId } = query;
    const where: any = { status: 'published' };
    if (ageRange) where.ageRange = ageRange;
    if (domain) where.domain = domain;

    // Apply parent control filters if childId is provided
    let allowedDomains: string[] | null = null;
    let blockedTopics: string[] = [];
    if (childId) {
      const control = await this.controlRepository.findOne({
        where: { childId: +childId },
      });
      if (control) {
        if (control.allowedDomains?.length > 0) {
          allowedDomains = control.allowedDomains;
        }
        if (control.blockedTopics?.length > 0) {
          blockedTopics = control.blockedTopics;
        }
      }
    }

    // Build query with filters
    const qb = this.contentsRepository.createQueryBuilder('content')
      .where('content.status = :status', { status: 'published' });

    if (ageRange) {
      qb.andWhere('content.ageRange = :ageRange', { ageRange });
    }
    if (domain) {
      qb.andWhere('content.domain = :domain', { domain });
    }
    if (allowedDomains) {
      qb.andWhere('content.domain IN (:...allowedDomains)', { allowedDomains });
    }
    if (blockedTopics.length > 0) {
      qb.andWhere('content.topic NOT IN (:...blockedTopics)', { blockedTopics });
    }

    const [list, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('content.id', 'DESC')
      .getManyAndCount();

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