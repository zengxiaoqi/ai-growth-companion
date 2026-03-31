import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto, RegisterDto } from './auth.dto';

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

    // 创建用户
    const user = await this.usersService.create({
      phone,
      password: hashedPassword,
      name,
      type: type || 'child',
      age,
      pin: hashedPin,
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

  private generateToken(user: any) {
    const payload = { sub: user.id, phone: user.phone, type: user.type };
    return this.jwtService.sign(payload);
  }

  private sanitizeUser(user: any) {
    const { password, pin, ...result } = user;
    return result;
  }
}