import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EmergencyCall } from '../../database/entities/emergency-call.entity';
import { UsersService } from '../users/users.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class EmergencyService {
  private readonly logger = new Logger(EmergencyService.name);
  private readonly accessKeyId: string;
  private readonly accessKeySecret: string;
  private readonly smsSignName: string;
  private readonly smsTemplateCode: string;
  private readonly voiceTtsCode: string;

  constructor(
    @InjectRepository(EmergencyCall)
    private emergencyRepository: Repository<EmergencyCall>,
    private usersService: UsersService,
    private notificationService: NotificationService,
    private configService: ConfigService,
  ) {
    this.accessKeyId = this.configService.get('ALIBABA_CLOUD_ACCESS_KEY_ID', '');
    this.accessKeySecret = this.configService.get('ALIBABA_CLOUD_ACCESS_KEY_SECRET', '');
    this.smsSignName = this.configService.get('ALIBABA_CLOUD_SMS_SIGN_NAME', '灵犀伴学');
    this.smsTemplateCode = this.configService.get('ALIBABA_CLOUD_SMS_TEMPLATE_CODE', '');
    this.voiceTtsCode = this.configService.get('ALIBABA_CLOUD_VOICE_TTS_CODE', '');
  }

  async triggerEmergencyCall(childId: number): Promise<EmergencyCall> {
    // 1. Look up child
    const child = await this.usersService.findById(childId);
    if (!child) {
      throw new NotFoundException('用户不存在');
    }

    // 2. Validate parent binding
    if (!child.parentId) {
      throw new BadRequestException('还没有绑定家长账号，无法使用紧急呼叫');
    }

    const parent = await this.usersService.findById(child.parentId);
    if (!parent) {
      throw new BadRequestException('家长账号不存在');
    }
    if (!parent.phone) {
      throw new BadRequestException('家长手机号未设置，无法发送通知');
    }

    // 3. Rate limiting: 1 per 60s, 5 per hour
    await this.checkRateLimit(childId);

    // 4. Create record
    const record = this.emergencyRepository.create({
      childId,
      parentId: parent.id,
      parentPhone: parent.phone,
      status: 'pending',
    });
    await this.emergencyRepository.save(record);

    // 5. Send SMS + Voice in parallel
    const isMock = !this.accessKeyId || !this.accessKeySecret;

    let smsResult = '';
    let callResult = '';
    let finalStatus = 'completed';
    let errorMessage = '';

    try {
      if (isMock) {
        this.logger.warn('阿里云凭证未配置，使用 mock 模式');
        const mockMsg = `[Mock] 紧急呼叫: 孩子"${child.name}"(ID:${childId}) -> 家长"${parent.name}"手机:${parent.phone}`;
        this.logger.log(mockMsg);
        smsResult = JSON.stringify({ mock: true, message: mockMsg });
        callResult = JSON.stringify({ mock: true, message: mockMsg });
      } else {
        const [smsRes, callRes] = await Promise.allSettled([
          this.sendSms(parent.phone, child.name),
          this.makeVoiceCall(parent.phone, child.name),
        ]);

        if (smsRes.status === 'fulfilled') {
          smsResult = JSON.stringify(smsRes.value);
        } else {
          this.logger.error('短信发送失败:', smsRes.reason);
          smsResult = JSON.stringify({ error: String(smsRes.reason) });
        }

        if (callRes.status === 'fulfilled') {
          callResult = JSON.stringify(callRes.value);
        } else {
          this.logger.error('语音呼叫失败:', callRes.reason);
          callResult = JSON.stringify({ error: String(callRes.reason) });
        }

        if (smsRes.status === 'rejected' && callRes.status === 'rejected') {
          finalStatus = 'failed';
          errorMessage = '短信和语音呼叫均失败';
        } else if (smsRes.status === 'rejected') {
          finalStatus = 'call_initiated';
          errorMessage = '短信发送失败';
        } else if (callRes.status === 'rejected') {
          finalStatus = 'sms_sent';
          errorMessage = '语音呼叫失败';
        }
      }
    } catch (error) {
      finalStatus = 'failed';
      errorMessage = String(error);
    }

    // 6. Update record
    record.status = finalStatus;
    record.smsResult = smsResult;
    record.callResult = callResult;
    record.errorMessage = errorMessage;
    await this.emergencyRepository.save(record);

    // 7. Create in-app notification for parent
    try {
      await this.notificationService.create({
        userId: parent.id,
        title: '紧急呼叫',
        message: `孩子"${child.name}"发起了紧急呼叫，请立即关注！`,
        type: 'system',
      });
    } catch (e) {
      this.logger.warn('创建应用内通知失败:', e);
    }

    return record;
  }

  async getHistory(childId: number, limit = 20): Promise<EmergencyCall[]> {
    return this.emergencyRepository.find({
      where: { childId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  private async checkRateLimit(childId: number): Promise<void> {
    const now = new Date();

    // SQLite stores local time strings, so compare with local ISO strings
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const pad = (n: number) => String(n).padStart(2, '0');
    const toLocal = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

    const recentMinute = await this.emergencyRepository
      .createQueryBuilder('ec')
      .where('ec.childId = :childId', { childId })
      .andWhere('ec.createdAt >= :cutoff', { cutoff: toLocal(oneMinuteAgo) })
      .getCount();

    if (recentMinute >= 1) {
      throw new BadRequestException('操作太频繁，请稍后再试');
    }

    const recentHour = await this.emergencyRepository
      .createQueryBuilder('ec')
      .where('ec.childId = :childId', { childId })
      .andWhere('ec.createdAt >= :cutoff', { cutoff: toLocal(oneHourAgo) })
      .getCount();

    if (recentHour >= 5) {
      throw new BadRequestException('紧急呼叫次数已达上限，请稍后再试');
    }
  }

  private async sendSms(phone: string, childName: string): Promise<any> {
    const DysmsApi = await import('@alicloud/dysmsapi20170525');
    const OpenApi = await import('@alicloud/openapi-client');
    const Util = await import('@alicloud/tea-util');

    const config = new OpenApi.Config({
      accessKeyId: this.accessKeyId,
      accessKeySecret: this.accessKeySecret,
      endpoint: 'dysmsapi.aliyuncs.com',
    });

    const client = new DysmsApi.default(config);
    const request = new DysmsApi.SendSmsRequest({
      phoneNumbers: phone,
      signName: this.smsSignName,
      templateCode: this.smsTemplateCode,
      templateParam: JSON.stringify({ name: childName }),
    });

    const runtime = new Util.RuntimeOptions({});
    return client.sendSmsWithOptions(request, runtime);
  }

  private async makeVoiceCall(phone: string, childName: string): Promise<any> {
    const DyvmsApi = await import('@alicloud/dyvmsapi20170525');
    const OpenApi = await import('@alicloud/openapi-client');
    const Util = await import('@alicloud/tea-util');

    const config = new OpenApi.Config({
      accessKeyId: this.accessKeyId,
      accessKeySecret: this.accessKeySecret,
      endpoint: 'dyvmsapi.aliyuncs.com',
    });

    const client = new DyvmsApi.default(config);
    const request = new DyvmsApi.SingleCallByTtsRequest({
      calledNumber: phone,
      ttsCode: this.voiceTtsCode,
      ttsParam: JSON.stringify({ name: childName }),
    });

    const runtime = new Util.RuntimeOptions({});
    return client.singleCallByTtsWithOptions(request, runtime);
  }
}
