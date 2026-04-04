import { Module } from '@nestjs/common';
import {
  WinstonModule,
  utilities as nestWinstonModuleUtilities,
} from 'nest-winston';
import * as winston from 'winston';
import * as path from 'path';

const logDir = path.resolve(__dirname, '..', 'logs');

export const loggerConfig = WinstonModule.createLogger({
  transports: [
    // Console output with color
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.ms(),
        nestWinstonModuleUtilities.format.nestLike('灵犀伴学', {
          colors: true,
          prettyPrint: true,
        }),
      ),
    }),
    // All logs to file
    new winston.transports.File({
      filename: path.join(logDir, 'app.log'),
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(
          ({ timestamp, level, context, message, ...meta }) => {
            const ctx = context || '';
            const metaStr = Object.keys(meta).length
              ? ` ${JSON.stringify(meta)}`
              : '';
            return `${timestamp} [${level}]${ctx ? ` [${ctx}]` : ''} ${message}${metaStr}`;
          },
        ),
      ),
    }),
    // Error logs to separate file
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(
          ({ timestamp, level, context, message, ...meta }) => {
            const ctx = context || '';
            const metaStr = Object.keys(meta).length
              ? ` ${JSON.stringify(meta)}`
              : '';
            return `${timestamp} [${level}]${ctx ? ` [${ctx}]` : ''} ${message}${metaStr}`;
          },
        ),
      ),
    }),
  ],
});

@Module({
  providers: [],
  exports: [],
})
export class LoggerModule {}
