import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { LoginDto, RegisterDto, VerifyPinDto } from "./auth.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";

@ApiTags("认证管理")
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("register")
  @ApiOperation({ summary: "用户注册" })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post("login")
  @ApiOperation({ summary: "用户登录" })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get("profile")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "获取当前用户信息" })
  async getProfile(@Request() req: any) {
    return this.authService.validateUser(req.user.sub);
  }

  @Post("verify-pin")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "验证家长管理密码" })
  async verifyPin(@Request() req: any, @Body() verifyPinDto: VerifyPinDto) {
    return this.authService.verifyPin(req.user.sub, verifyPinDto.pin);
  }

  @Post("set-pin")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "设置家长管理密码" })
  async setPin(@Request() req: any, @Body() verifyPinDto: VerifyPinDto) {
    return this.authService.setPin(req.user.sub, verifyPinDto.pin);
  }
}
