import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ContentsService } from './contents.service';

@Controller('contents')
export class ContentsController {
  constructor(private readonly contentsService: ContentsService) {}

  @Get()
  async findAll(@Query() query: any) {
    return this.contentsService.findAll(query);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.contentsService.findById(+id);
  }

  @Post()
  async create(@Body() data: any) {
    return this.contentsService.create(data);
  }
}