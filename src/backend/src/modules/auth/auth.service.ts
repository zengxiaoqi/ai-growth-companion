import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
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
    const { phone, password, name, type, age } = registerDto;
    
    // 检查手机号是否已注册
    const existingUser = await this.usersService.findByPhone(phone);
    if (existingUser) {
      throw new ConflictException('手机号已被注册');
    }
    
    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // 创建用户
    const user = await this.usersService.create({
      phone,
      password: hashedPassword,
      name,
      type: type || 'child',
      age,
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

  private generateToken(user: any) {
    const payload = { sub: user.id, phone: user.phone, type: user.type };
    return this.jwtService.sign(payload);
  }

  private sanitizeUser(user: any) {
    const { password, ...result } = user;
    return result;
  }
}