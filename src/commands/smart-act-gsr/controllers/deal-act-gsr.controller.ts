import { Controller, Get, Injectable } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DealServiceService } from '../services/deal-service.service';
import { SendDealsWarningsUseCase } from '../usecases/send-deals-warnings.use-case';

@Injectable()
@ApiTags('Commands Deal Act Gsr')
@Controller('commands/smart-act-gsr')
export class DealActGsrController {
    constructor(
        private readonly dealService: DealServiceService,
        private readonly sendDealsWarningsUseCase: SendDealsWarningsUseCase,
    ) {}

    @Get('deals')
    @ApiOperation({ summary: 'Get deals' })
    @ApiResponse({
        status: 200,
        description: 'Returns deals',
    })
    async getDeals() {
        return await this.dealService.getDealService();
    }

    @Get('deals-groupped-by-comapny')
    @ApiOperation({ summary: 'Get deals groupped by comapny' })
    @ApiResponse({
        status: 200,
        description: 'Returns deals groupped by comapny',
    })
    async getDealsGrouppedByComapny() {
        return await this.dealService.geGrouppedByComapny();
    }

    @Get('deals-with-empty-one-of-contract-period-fields')
    @ApiOperation({
        summary: 'Get deals with empty one of contract period fields',
    })
    @ApiResponse({
        status: 200,
        description: 'Returns deals with empty one of contract period fields',
    })
    async getDealsWithEmptyOneOfContractPeriodFields() {
        return await this.dealService.getDealsWithEmptyOneOfContractPeriodFields();
    }

    @Get('send-message')
    @ApiOperation({ summary: 'Send message' })
    @ApiResponse({
        status: 200,
        description: 'Returns message',
    })
    async sendMessage() {
        return await this.sendDealsWarningsUseCase.execute();
    }
}
