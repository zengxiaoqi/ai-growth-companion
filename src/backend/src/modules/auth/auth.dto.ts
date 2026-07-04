import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: '手机号' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ description: '密码' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class RegisterDto {
  @ApiProperty({ description: '手机号' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ description: '密码' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ description: '用户名' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: '用户类型: child/parent' })
  @IsOptional()
  @IsIn(['child', 'parent'])
  type?: string;

  @ApiPropertyOptional({ description: '孩子年龄', minimum: 3, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(12)
  age?: number;

  @ApiPropertyOptional({ description: '家长ID（如果是孩子账号）' })
  @IsOptional()
  @IsInt()
  parentId?: number;

  @ApiPropertyOptional({ description: '家长管理密码（4位数字）' })
  @IsOptional()
  @IsString()
  pin?: string;
}

export class VerifyPinDto {
  @ApiProperty({ description: '家长管理密码（4位数字）' })
  @IsString()
  @IsNotEmpty()
  pin: string;
}

export class SwitchToParentDto {
  @ApiProperty({ description: '家长登录密码' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class ChildLoginDto {
  @ApiProperty({ description: '孩子6位登录验证码' })
  @IsString()
  @IsNotEmpty()
  loginCode: string;
}
