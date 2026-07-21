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

  /** 获取用户信息（过滤密码哈希和 PIN） */
  async findSafeById(id: number): Promise<Omit<User, 'password' | 'pin'> | null> {
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
        loginCode: true,
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

  /** 通过手机号或用户名查找用户（用于登录/绑定场景） */
  async findByPhoneOrName(phoneOrName: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: [{ phone: phoneOrName }, { name: phoneOrName }],
    });
  }

  /** 通过 loginCode 查找孩子账号 */
  async findByLoginCode(loginCode: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { loginCode } });
  }

  async findByParentId(parentId: number): Promise<Omit<User, 'password' | 'pin'>[]> {
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
        loginCode: true,
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
      throw new NotFoundException('用户不存在');
    }
    return user as User;
  }

  async delete(id: number): Promise<void> {
    const result = await this.usersRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('用户不存在');
    }
  }

  async linkChild(parentId: number, childPhoneOrName: string, loginCode?: string): Promise<User> {
    const parent = await this.findById(parentId);
    if (!parent || parent.type !== 'parent') {
      throw new BadRequestException('仅家长账号可关联孩子');
    }

    // 支持通过手机号或用户名查找孩子
    const child = await this.findByPhoneOrName(childPhoneOrName);
    if (!child) {
      throw new NotFoundException('未找到该手机号/账号对应的用户');
    }
    if (child.type !== 'child') {
      throw new BadRequestException('只能关联孩子类型的账号');
    }
    if (child.parentId === parentId) {
      // 已绑定自己，仍然需要验证 loginCode 防止信息泄露
      if (!loginCode || !child.loginCode || loginCode !== child.loginCode) {
        throw new BadRequestException('验证码错误，请输入该孩子的6位登录验证码');
      }
      return this.findSafeById(child.id) as Promise<User>;
    }

    // 安全验证：必须提供正确的 loginCode 才能绑定
    // 防止误绑他人孩子 + 恶意绑定
    if (!loginCode || !child.loginCode || loginCode !== child.loginCode) {
      throw new BadRequestException('验证码错误，请输入该孩子的6位登录验证码');
    }

    child.parentId = parentId;
    await this.usersRepository.save(child);
    return this.findSafeById(child.id) as Promise<User>;
  }

  async canAccessChild(viewerId: number, viewerType: string, childId: number): Promise<boolean> {
    if (viewerType === 'child') return viewerId === childId;
    if (viewerType === 'parent') {
      // Parent can access their own data (parent conversations store childId = parentId)
      if (childId === viewerId) return true;
      const child = await this.findById(childId);
      return Boolean(child && child.parentId === viewerId);
    }
    return false;
  }

  /** 生成6位登录验证码（大写字母+数字，排除易混淆字符） */
  private generateLoginCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉 I/O/0/1
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  /** 生成唯一的 loginCode（检查数据库不重复） */
  async generateUniqueLoginCode(): Promise<string> {
    let loginCode = this.generateLoginCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await this.usersRepository.findOne({ where: { loginCode } });
      if (!existing) break;
      loginCode = this.generateLoginCode();
      attempts++;
    }
    return loginCode;
  }

  /** 添加孩子账号 */
  async addChild(
    parentId: number,
    childData: { name: string; phone?: string; age?: number; gender?: string },
  ): Promise<User> {
    const parent = await this.findById(parentId);
    if (!parent || parent.type !== 'parent') {
      throw new BadRequestException('仅家长账号可添加孩子');
    }

    // 检查手机号是否已存在
    if (childData.phone) {
      const existing = await this.findByPhone(childData.phone);
      if (existing) {
        throw new BadRequestException('该手机号已被使用');
      }
    }

    // 生成唯一的 loginCode
    const loginCode = await this.generateUniqueLoginCode();

    const child = this.usersRepository.create({
      name: childData.name,
      phone: childData.phone,
      age: childData.age,
      gender: childData.gender,
      type: 'child',
      parentId: parentId,
      password: '', // 孩子账号不需要密码（由家长管理）
      loginCode,
    });

    const saved = await this.usersRepository.save(child);
    return this.findSafeById(saved.id) as Promise<User>;
  }

  /** 更新孩子信息（仅家长可操作自己的孩子） */
  async updateChild(
    parentId: number,
    childId: number,
    childData: { name?: string; phone?: string; age?: number; gender?: string },
  ): Promise<User> {
    const child = await this.findById(childId);
    if (!child) {
      throw new NotFoundException('孩子不存在');
    }
    if (child.parentId !== parentId) {
      throw new BadRequestException('只能修改自己的孩子信息');
    }
    if (child.type !== 'child') {
      throw new BadRequestException('只能修改孩子类型的账号');
    }

    // 检查手机号是否已被其他用户使用
    if (childData.phone && childData.phone !== child.phone) {
      const existing = await this.findByPhone(childData.phone);
      if (existing) {
        throw new BadRequestException('该手机号已被使用');
      }
    }

    const updateData: Partial<User> = {};
    if (childData.name !== undefined) updateData.name = childData.name;
    if (childData.phone !== undefined) updateData.phone = childData.phone;
    if (childData.age !== undefined) updateData.age = childData.age;
    if (childData.gender !== undefined) updateData.gender = childData.gender;

    await this.usersRepository.update(childId, updateData);
    return this.findSafeById(childId) as Promise<User>;
  }

  /** 删除孩子账号（仅家长可操作自己的孩子） */
  async deleteChild(parentId: number, childId: number): Promise<void> {
    const child = await this.findById(childId);
    if (!child) {
      throw new NotFoundException('孩子不存在');
    }
    if (child.parentId !== parentId) {
      throw new BadRequestException('只能删除自己的孩子');
    }
    if (child.type !== 'child') {
      throw new BadRequestException('只能删除孩子类型的账号');
    }

    await this.usersRepository.delete(childId);
  }

  /** 重新生成孩子的登录验证码（仅家长可操作自己的孩子） */
  async regenerateLoginCode(parentId: number, childId: number): Promise<User> {
    const child = await this.findById(childId);
    if (!child) {
      throw new NotFoundException('孩子不存在');
    }
    if (child.parentId !== parentId) {
      throw new BadRequestException('只能操作自己的孩子');
    }
    if (child.type !== 'child') {
      throw new BadRequestException('只能操作孩子类型的账号');
    }

    const loginCode = await this.generateUniqueLoginCode();
    await this.usersRepository.update(childId, { loginCode });
    return this.findSafeById(childId) as Promise<User>;
  }

  /** 设置自定义登录验证码（仅家长可操作自己的孩子） */
  async setLoginCode(parentId: number, childId: number, customCode: string): Promise<User> {
    const child = await this.findById(childId);
    if (!child) {
      throw new NotFoundException('孩子不存在');
    }
    if (child.parentId !== parentId) {
      throw new BadRequestException('只能操作自己的孩子');
    }
    if (child.type !== 'child') {
      throw new BadRequestException('只能操作孩子类型的账号');
    }

    // 验证格式：6位大写字母+数字（排除易混淆字符）
    const validChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = customCode.toUpperCase().trim();
    if (code.length !== 6 || !code.split('').every((c) => validChars.includes(c))) {
      throw new BadRequestException('验证码必须是6位大写字母+数字（不含 I/O/0/1）');
    }

    // 检查唯一性
    const existing = await this.usersRepository.findOne({ where: { loginCode: code } });
    if (existing && existing.id !== childId) {
      throw new BadRequestException('该验证码已被其他账号使用');
    }

    await this.usersRepository.update(childId, { loginCode: code });
    return this.findSafeById(childId) as Promise<User>;
  }
}
