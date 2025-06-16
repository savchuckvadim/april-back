import { Controller, Post, Body, Logger, Param, ValidationPipe, Get, Query } from '@nestjs/common';
import { CreateDealUseCase } from './use-cases/create-deal.use-case';
import { CreateDealBodyDto, CreateDealDto } from './dto/create-deal.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TestSmartService } from './services/test-smart.service';

@ApiTags('Alfa')
@Controller('alfa')
export class AlfaController {
  constructor(
    private readonly alfaUseCase: CreateDealUseCase,
    private readonly testSmartService: TestSmartService

  ) { }

  @Post('create-deal/:dealId')
  async createDeal(
    @Body(ValidationPipe) body: CreateDealBodyDto,
    @Param('dealId') dealId: string
  ) {
    const fullDto = { ...body, dealId: Number(dealId) };
    Logger.log(body)
    return this.alfaUseCase.onDealCreate(fullDto);
  }

  // @ApiOperation({ summary: 'Get smarts' })
  // @Get('get-smarts')
  // async getSmarts(@Query('domain') domain: string) {
  //   return await this.testSmartService.getSmarts(domain);
  // }
}
