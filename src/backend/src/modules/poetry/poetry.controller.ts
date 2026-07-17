import { Controller, Get, Query, Param } from '@nestjs/common';
import { PoetryService } from './poetry.service';

@Controller('poetry')
export class PoetryController {
  constructor(private readonly poetryService: PoetryService) {}

  // 获取诗词列表
  @Get()
  async findAll(
    @Query('page') page = '1',
    @Query('page_size') pageSize = '20',
    @Query('lang') lang = 'zh-Hans',
  ) {
    return this.poetryService.findAll(+page, +pageSize, lang);
  }

  // 随机诗词
  @Get('random')
  async findRandom(
    @Query('author') author?: string,
    @Query('dynasty') dynasty?: string,
    @Query('type') type?: string,
    @Query('char') char?: string,
    @Query('lang') lang = 'zh-Hans',
  ) {
    return this.poetryService.findRandom({ author, dynasty, type, char }, lang);
  }

  // 搜索诗词
  @Get('search')
  async search(
    @Query('q') query: string,
    @Query('type') searchType = 'all',
    @Query('page') page = '1',
    @Query('page_size') pageSize = '20',
    @Query('lang') lang = 'zh-Hans',
  ) {
    return this.poetryService.search(query, searchType, +page, +pageSize, lang);
  }

  // 获取作者列表
  @Get('authors')
  async findAuthors(@Query('page') page = '1', @Query('page_size') pageSize = '20') {
    return this.poetryService.findAuthors(+page, +pageSize);
  }

  // 获取朝代列表
  @Get('dynasties')
  async findDynasties() {
    return this.poetryService.findDynasties();
  }

  // 获取统计信息
  @Get('statistics')
  async getStatistics() {
    return this.poetryService.getStatistics();
  }

  // 获取诗词体裁列表
  @Get('types')
  async findTypes() {
    return this.poetryService.findTypes();
  }

  // 获取单首诗词（只匹配数字 ID）
  @Get(':id(\\d+)')
  async findById(@Param('id') id: string, @Query('lang') lang = 'zh-Hans') {
    return this.poetryService.findById(+id, lang);
  }
}
