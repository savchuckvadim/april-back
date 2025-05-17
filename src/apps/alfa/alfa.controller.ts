import { Controller, Post, Body, Logger, Param, ValidationPipe } from '@nestjs/common';
import { CreateDealUseCase } from './use-cases/create-deal.use-case';
import { CreateDealBodyDto, CreateDealDto } from './dto/create-deal.dto';

@Controller('alfa')
export class AlfaController {
  constructor(
    private readonly alfaUseCase: CreateDealUseCase

  ) { }

  @Post('create-deal/:dealId')
  async createDeal(
    @Body(ValidationPipe) body: CreateDealBodyDto,
    @Param('dealId') dealId: string
  ) {
    const fullDto = { ...body, dealId: Number(dealId) };
    Logger.log(body)
    return this.alfaUseCase.createDeal(fullDto);
  }
}
