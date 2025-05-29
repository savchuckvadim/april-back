import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { ChangeDealCategoryService } from './change-deal-category.service';
import { GetDealsDto, ReplaceDealsDto } from './dto/get-deals.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';


@ApiTags('BX Commands')
@Controller('change-deal-category')
export class ChangeDealCategoryController {
  constructor(private readonly changeDealCategoryService: ChangeDealCategoryService) { }

  @Get('get-deals')
  @ApiOperation({ summary: 'Get deals', description: 'Get deals by domain and category id' })
  @ApiResponse({ status: 200, description: 'Deals fetched successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  async getDeals(@Query() dto: GetDealsDto) {
    return await this.changeDealCategoryService.getDeals(dto);
  }


  @Get('get-deals-batch')
  @ApiOperation({ summary: 'Get deals', description: 'Get deals by domain and category id' })
  @ApiResponse({ status: 200, description: 'Deals fetched successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  async getDealsBatch(@Query() dto: GetDealsDto) {
    return await this.changeDealCategoryService.getDealsBtch(dto);
  }


  @Get('replace-deals')
  @ApiOperation({ summary: 'Get deals', description: 'Get deals by domain and category id' })
  @ApiResponse({ status: 200, description: 'Deals fetched successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  async replaceDeals(@Query() dto: ReplaceDealsDto) {
    return await this.changeDealCategoryService.replaceDeals(dto);
  }
}
