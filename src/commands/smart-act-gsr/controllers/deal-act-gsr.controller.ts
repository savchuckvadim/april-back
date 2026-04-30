import { Controller, Get, Injectable } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrkDealsService } from '../services/ork-deals.service';
import { OrkActsUpdateUseCase } from '../usecases/ork-acts-update.use-case';
import { ActNProductHandlerUseCase } from '../usecases/act-n-product-handler.use-case';

@Injectable()
@ApiTags('Commands Deal Act Gsr')
@Controller('commands/smart-by-deal-act-gsr')
export class DealActGsrController {
    constructor(
        private readonly dealService: OrkDealsService,
        private readonly orkActsUpdateUseCase: OrkActsUpdateUseCase,
        private readonly useCase: ActNProductHandlerUseCase,
    ) {}

    // @Get('deals-groupped-by-comapny')
    // @ApiOperation({ summary: 'Get deals groupped by comapny' })
    // @ApiResponse({
    //     status: 200,
    //     description: 'Returns deals groupped by comapny',
    // })
    // async getDealsGrouppedByComapny() {
    //     return await this.dealService.geGrouppedByComapny();
    // }

    // @Get('deals-with-empty-one-of-contract-period-fields')
    // @ApiOperation({
    //     summary: 'Get deals with empty one of contract period fields',
    // })
    // @ApiResponse({
    //     status: 200,
    //     description: 'Returns deals with empty one of contract period fields',
    // })
    // async getDealsWithEmptyOneOfContractPeriodFields() {
    //     return await this.dealService.getDealsWithEmptyOneOfContractPeriodFields();
    // }

    @Get('ork-acts-update')
    @ApiOperation({ summary: 'Send message' })
    @ApiResponse({
        status: 200,
        description: 'Returns message',
    })
    async sendMessage() {
        return await this.useCase.execute();
    }
}
