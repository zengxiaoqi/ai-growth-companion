import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EmergencyCall } from "../../database/entities/emergency-call.entity";
import { EmergencyService } from "./emergency.service";
import { EmergencyController } from "./emergency.controller";
import { UsersModule } from "../users/users.module";
import { NotificationModule } from "../notification/notification.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([EmergencyCall]),
    UsersModule,
    NotificationModule,
  ],
  providers: [EmergencyService],
  controllers: [EmergencyController],
  exports: [EmergencyService],
})
export class EmergencyModule {}
