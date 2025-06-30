import { Body, Controller, Logger, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { InitSupplyUseCase } from './init-supply.use-case';
import { InitSupplyDto } from './dto/init-supply.dto';
import { ApiTags } from '@nestjs/swagger';


@ApiTags('Konstructor')
@Controller('konstructor')
export class InitSupplyController {
  constructor(private readonly initSupplyUseCase: InitSupplyUseCase) { }

  @Post('init-supply')

  async initSupply(@Body() body: InitSupplyDto) {

    return await this.initSupplyUseCase.initSupply(body);

  }
}
