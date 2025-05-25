import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CategoryService } from './category.service';
import { GetCategoryListDto, GetCategoryWithStagesDto, GetStagesDto } from './dto/get-category.dto';
import { GetCategoryResponseDto } from './dto/category-response.dto';

@ApiTags('BX Category')
@Controller('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) { }

  @Post('')
  @ApiOperation({ summary: 'Get list of categories' })
  @ApiResponse({
    status: 200,
    description: 'Returns list of categories',
    type: GetCategoryResponseDto
  })
  async get(@Body() dto: GetCategoryWithStagesDto) {
    return await this.categoryService.get(dto);
  }

  @Post('list')
  @ApiOperation({ summary: 'Get list of categories' })
  @ApiResponse({
    status: 200,
    description: 'Returns list of categories',
    type: GetCategoryResponseDto
  })
  async findAll(@Body() dto: GetCategoryListDto) {
    return await this.categoryService.findAll(dto);
  }

  @Post('stages')
  @ApiOperation({ summary: 'Get list of stages' })
  @ApiResponse({
    status: 200,
    description: 'Returns list of stages',
    type: GetCategoryResponseDto
  })
  async stages(@Body() dto: GetStagesDto) {
    return await this.categoryService.findStages(dto);
  }
}
