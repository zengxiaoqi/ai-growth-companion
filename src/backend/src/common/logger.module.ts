import { Module } from "@nestjs/common";
import {
  WinstonModule,
  utilities as nestWinstonModuleUtilities,
} from "nest-winston";
import * as winston from "winston";
import * as path from "path";

import * as fs from "fs";

// __dirname in compiled code is dist/common, so go up 2 levels to reach src/backend/
const backendRoot = path.resolve(__dirname, "..", "..");
const logDir = path.join(backendRoot, "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const LOG_LEVEL = process.env.LOG_LEVEL || "debug";

export const loggerConfig = WinstonModule.createLogger({
  level: LOG_LEVEL,
  transports: [
    // Console output with color
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.ms(),
        nestWinstonModuleUtilities.format.nestLike("灵犀伴学", {
          colors: true,
          prettyPrint: true,
        }),
      ),
    }),
    // All logs (including debug) to file
    new winston.transports.File({
      filename: path.join(logDir, "app.log"),
      level: "debug",
      options: { encoding: "utf8" },
      format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.printf(
          ({ timestamp, level, context, message, ...meta }) => {
            const ctx = context || "";
            const metaStr = Object.keys(meta).length
              ? ` ${JSON.stringify(meta)}`
              : "";
            return `${timestamp} [${level}]${ctx ? ` [${ctx}]` : ""} ${message}${metaStr}`;
          },
        ),
      ),
    }),
    // Error logs to separate file
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      options: { encoding: "utf8" },
      format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.printf(
          ({ timestamp, level, context, message, ...meta }) => {
            const ctx = context || "";
            const metaStr = Object.keys(meta).length
              ? ` ${JSON.stringify(meta)}`
              : "";
            return `${timestamp} [${level}]${ctx ? ` [${ctx}]` : ""} ${message}${metaStr}`;
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
