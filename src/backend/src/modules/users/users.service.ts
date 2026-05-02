import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../../database/entities/user.entity";

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

  /** 获取用户信息（过滤密码哈希和 PIN） */
  async findSafeById(
    id: number,
  ): Promise<Omit<User, "password" | "pin"> | null> {
    const user = await this.usersRepository.findOne({
      where: { id },
      select: {
        id: true,
        phone: true,
        name: true,
        type: true,
        parentId: true,
        avatar: true,
        age: true,
        gender: true,
        settings: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return user;
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { phone } });
  }

  async findByParentId(
    parentId: number,
  ): Promise<Omit<User, "password" | "pin">[]> {
    return this.usersRepository.find({
      where: { parentId },
      select: {
        id: true,
        phone: true,
        name: true,
        type: true,
        parentId: true,
        avatar: true,
        age: true,
        gender: true,
        settings: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async update(id: number, userData: Partial<User>): Promise<User> {
    await this.usersRepository.update(id, userData);
    const user = await this.findSafeById(id);
    if (!user) {
      throw new NotFoundException("用户不存在");
    }
    return user as User;
  }

  async delete(id: number): Promise<void> {
    const result = await this.usersRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException("用户不存在");
    }
  }

  async linkChild(parentId: number, childPhone: string): Promise<User> {
    const parent = await this.findById(parentId);
    if (!parent || parent.type !== "parent") {
      throw new BadRequestException("仅家长账号可关联孩子");
    }

    const child = await this.findByPhone(childPhone);
    if (!child) {
      throw new NotFoundException("未找到该手机号对应的用户");
    }
    if (child.type !== "child") {
      throw new BadRequestException("只能关联孩子类型的账号");
    }
    if (child.parentId === parentId) {
      return child;
    }

    child.parentId = parentId;
    await this.usersRepository.save(child);
    return this.findSafeById(child.id) as Promise<User>;
  }

  async canAccessChild(
    viewerId: number,
    viewerType: string,
    childId: number,
  ): Promise<boolean> {
    if (viewerType === "child") return viewerId === childId;
    if (viewerType === "parent") {
      const child = await this.findById(childId);
      return Boolean(child && child.parentId === viewerId);
    }
    return false;
  }
}
