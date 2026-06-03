import { Body, Controller, Get, Injectable, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
// import { OrkDealsService } from '../services/ork-deals.service';
// import { OrkActsUpdateUseCase } from '../usecases/ork-acts-update.use-case';
import { ActNProductHandlerUseCase } from '../usecases/act-n-product-handler.use-case';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { BxWebHookDto } from '@/modules/bitrix/dto/bx-webhook.dto';

@Injectable()
@ApiTags('Commands Deal Act Gsr')
@Controller('commands/smart-by-deal-act-gsr')
export class DealActGsrController {
    constructor(
        private readonly useCase: ActNProductHandlerUseCase,
        private readonly queue: QueueDispatcherService,
    ) {}

    @Post('ork-acts-update-test')
    @ApiOperation({ summary: 'Prepare deals and acts' })
    @ApiResponse({
        status: 200,
        description: 'Returns message',
    })
    async sendMessageWebhookTest(
        @Body() body: BxWebHookDto,
        @Query('dealId') dealId?: number,
    ) {
        const domain = body.auth.domain;
        console.log('sendMessageWebhook', domain, dealId);
        return await this.useCase.execute(dealId);
    }

    @Post('ork-acts-update-webhook')
    @ApiOperation({ summary: 'Send message' })
    @ApiResponse({
        status: 200,
        description: 'Returns message',
    })
    async sendMessageWebhook(
        @Body() body: BxWebHookDto,
        @Query('dealId') dealId?: number,
    ) {
        const domain = body.auth.domain;
        console.log('sendMessageWebhook', domain, dealId);
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
