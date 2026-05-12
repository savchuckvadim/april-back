import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
// import { OrkDealsService } from '../services/ork-deals.service';
// import { OrkActsUpdateUseCase } from '../usecases/ork-acts-update.use-case';
import { ActNProductHandlerUseCase } from '../usecases/act-n-product-handler.use-case';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';

@Injectable()
@ApiTags('Commands Deal Act Gsr')
@Controller('commands/smart-by-deal-act-gsr')
export class DealActGsrController {
    constructor(
        private readonly useCase: ActNProductHandlerUseCase,
        private readonly queue: QueueDispatcherService,
    ) {}

    @Get('ork-acts-update-webhook')
    @ApiOperation({ summary: 'Send message' })
    @ApiResponse({
        status: 200,
        description: 'Returns message',
    })
    async sendMessageWebhook(@Query('dealId') dealId?: number) {
        console.log('sendMessageWebhook', dealId);
        return await this.useCase.execute(dealId);
    }

    @Get('ork-acts-update-worker')
    @ApiOperation({ summary: 'Send message' })
    @ApiResponse({
        status: 200,
        description: 'Returns message',
    })
    async sendMessageWorker() {
        return await this.queue.dispatch(
            QueueNames.SERVICE_GENERATE_ACTS,
            JobNames.SERVICE_GENERATE_ACTS,
            { dealId: undefined },
        );
    }

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
