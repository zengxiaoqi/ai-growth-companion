import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async create(userData: Partial<User>): Promise<User> {
    const user = this.usersRepository.create(userData);
    return this.usersRepository.save(user);
  }

  async findById(id: number): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { phone } });
  }

  async findByParentId(parentId: number): Promise<User[]> {
    return this.usersRepository.find({ where: { parentId } });
  }

  async update(id: number, userData: Partial<User>): Promise<User> {
    await this.usersRepository.update(id, userData);
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    return user;
  }

  async delete(id: number): Promise<void> {
    const result = await this.usersRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('用户不存在');
    }
  }

  async linkChild(parentId: number, childPhone: string): Promise<User> {
    const parent = await this.findById(parentId);
    if (!parent || parent.type !== 'parent') {
      throw new BadRequestException('仅家长账号可关联孩子');
    }

    const child = await this.findByPhone(childPhone);
    if (!child) {
      throw new NotFoundException('未找到该手机号对应的用户');
    }
    if (child.type !== 'child') {
      throw new BadRequestException('只能关联孩子类型的账号');
    }
    if (child.parentId === parentId) {
      return child;
    }

    child.parentId = parentId;
    return this.usersRepository.save(child);
  }

  async canAccessChild(viewerId: number, viewerType: string, childId: number): Promise<boolean> {
    if (viewerType === 'child') return viewerId === childId;
    if (viewerType === 'parent') {
      const child = await this.findById(childId);
      return Boolean(child && child.parentId === viewerId);
    }
    return false;
  }
}
