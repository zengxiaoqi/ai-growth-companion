import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto, RegisterDto, ChildLoginDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { phone, password, name, type, age, pin } = registerDto;

    // 检查手机号是否已注册
    const existingUser = await this.usersService.findByPhone(phone);
    if (existingUser) {
      throw new ConflictException('手机号已被注册');
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 如果是家长账号且提供了PIN，加密PIN
    let hashedPin: string | undefined;
    if (type === 'parent' && pin) {
      if (!/^\d{4}$/.test(pin)) {
        throw new BadRequestException('管理密码必须是4位数字');
      }
      hashedPin = await bcrypt.hash(pin, 10);
    }

    // 孩子账号自动生成 loginCode（用于快捷登录）
    let loginCode: string | undefined;
    if ((type || 'child') === 'child') {
      loginCode = await this.usersService.generateUniqueLoginCode();
    }

    // 创建用户
    const user = await this.usersService.create({
      phone,
      password: hashedPassword,
      name,
      type: type || 'child',
      age,
      pin: hashedPin,
      loginCode,
    });

    // 生成 Token
    const token = this.generateToken(user);

    return {
      user: this.sanitizeUser(user),
      token,
    };
  }

  async login(loginDto: LoginDto) {
    const { phone, password } = loginDto;

    const user = await this.usersService.findByPhone(phone);
    if (!user) {
      throw new UnauthorizedException('手机号或密码错误');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('手机号或密码错误');
    }

    const token = this.generateToken(user);

    return {
      user: this.sanitizeUser(user),
      token,
    };
  }

  /** 孩子快捷登录（通过6位 loginCode） */
  async childLogin(childLoginDto: ChildLoginDto) {
    const { loginCode } = childLoginDto;

    const user = await this.usersService.findByLoginCode(loginCode);
    if (!user) {
      throw new UnauthorizedException('验证码无效');
    }
    if (user.type !== 'child') {
      throw new UnauthorizedException('该验证码仅限孩子账号使用');
    }

    const token = this.generateToken(user);

    return {
      user: this.sanitizeUser(user),
      token,
    };
  }

  async validateUser(userId: number) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }
    return this.sanitizeUser(user);
  }

  async verifyPin(userId: number, pin: string) {
    if (!pin || !/^\d{4}$/.test(pin)) {
      throw new BadRequestException('管理密码必须是4位数字');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }
    if (user.type !== 'parent') {
      throw new UnauthorizedException('仅家长账号可验证管理密码');
    }
    if (!user.pin) {
      // No PIN set yet — allow access and prompt to set one
      return { valid: true, needsSetup: true };
    }

    const isValid = await bcrypt.compare(pin, user.pin);
    if (!isValid) {
      throw new UnauthorizedException('管理密码错误');
    }
    return { valid: true, needsSetup: false };
  }

  async setPin(userId: number, pin: string) {
    if (!pin || !/^\d{4}$/.test(pin)) {
      throw new BadRequestException('管理密码必须是4位数字');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }
    if (user.type !== 'parent') {
      throw new UnauthorizedException('仅家长账号可设置管理密码');
    }

    const hashedPin = await bcrypt.hash(pin, 10);
    await this.usersService.update(userId, { pin: hashedPin });
    return { success: true };
  }

  /** 家长切换到孩子模式（无需PIN验证） */
  async switchToChild(parentId: number, childId?: number) {
    const parent = await this.usersService.findById(parentId);
    if (!parent || parent.type !== 'parent') {
      throw new UnauthorizedException('仅家长账号可切换到孩子模式');
    }

    let child: any;
    if (childId) {
      child = await this.usersService.findById(childId);
      if (!child || child.type !== 'child' || child.parentId !== parentId) {
        throw new BadRequestException('无效的孩子账号');
      }
    } else {
      const children = await this.usersService.findByParentId(parentId);
      if (!children.length) {
        throw new BadRequestException('尚未绑定孩子账号');
      }
      child = await this.usersService.findById(children[0].id);
    }

    const token = this.generateToken(child);
    return {
      user: this.sanitizeUser(child),
      token,
    };
  }

  /** 孩子切换到家长模式（需要家长登录密码验证） */
  async switchToParent(childId: number, password: string) {
    if (!password) {
      throw new BadRequestException('请输入家长登录密码');
    }

    const child = await this.usersService.findById(childId);
    if (!child || child.type !== 'child') {
      throw new UnauthorizedException('仅孩子账号可切换到家长模式');
    }

    if (!child.parentId) {
      throw new BadRequestException('该孩子账号未绑定家长');
    }

    const parent = await this.usersService.findById(child.parentId);
    if (!parent || parent.type !== 'parent') {
      throw new UnauthorizedException('家长账号不存在');
    }

    const isValid = await bcrypt.compare(password, parent.password);
    if (!isValid) {
      throw new UnauthorizedException('家长密码错误');
    }

    return {
      user: this.sanitizeUser(parent),
      token: this.generateToken(parent),
    };
  }

  private generateToken(user: any) {
    const payload = { sub: user.id, phone: user.phone, type: user.type };
    return this.jwtService.sign(payload);
  }

  private sanitizeUser(user: any) {
    const { password: _password, pin: _pin, ...result } = user;
    return result;
  }
}
