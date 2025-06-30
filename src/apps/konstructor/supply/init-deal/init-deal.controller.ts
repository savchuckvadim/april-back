import { Body, Controller, Post, Query } from "@nestjs/common";

import { ApiTags } from "@nestjs/swagger";
import { InitDealDto } from "./dto/init-deal.dto";
import { InitDealUseCase } from "./init-deal.use-case";


@ApiTags('Konstructor')
@Controller('supply')
export class InitDealController {
    constructor(
        private readonly initDealUseCase: InitDealUseCase
    ) { }

    @Post('init-deal')
    async initDeal(@Body() body: InitDealDto) {
        return await this.initDealUseCase.execute(body)
    }
}