import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ContentsService } from "./contents.service";
import { ContentsController } from "./contents.controller";
import { Content } from "../../database/entities/content.entity";
import { ParentControl } from "../../database/entities/parent-control.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Content, ParentControl])],
  providers: [ContentsService],
  controllers: [ContentsController],
  exports: [ContentsService],
})
export class ContentsModule {}
