import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SendDealsWarningsUseCase } from '../usecases/send-deals-warnings.use-case';

@ApiTags('Event Service Deals Order')
@Controller('event-service/deals-order')
export class DealsOrderController {
    constructor(
        private readonly sendDealsWarningsUseCase: SendDealsWarningsUseCase,
    ) {}

    @ApiOperation({ summary: 'Send deals warnings' })
    @ApiResponse({ status: 200, description: 'Deals warnings sent' })
    @Get('send-deals-warnings')
    async sendDealsWarnings() {
        return this.sendDealsWarningsUseCase.execute();
    }
}
