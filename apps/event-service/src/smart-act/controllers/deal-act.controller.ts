import { Body, Controller, Injectable, Post, Query } from '@nestjs/common';
import {
    ApiBody,
    ApiOperation,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { BxWebHookDto } from '@/modules/bitrix/dto/bx-webhook.dto';
import { SmartActQueueService } from '../services';

/**
 * TODO - оставить только один endpoint для хука из битрикс
 *  обернуть в silence на случай ручного запуска для множества сущностей
 *
 */
@Injectable()
@ApiTags('Event ServiceDealAct')
@Controller('/smart-by-deal-act')
export class DealActController {
    constructor(
        // private readonly useCase: ActNProductHandlerUseCase,
        private readonly smartActQueueService: SmartActQueueService,
    ) { }

    @Post('ork-deal-acts-webhook')
    @ApiOperation({
        summary: 'Send message',
        description:
            'Обрабатывает финансову. информацию в сделке. Приводит в сделке все акты и количество товара в соответствии со значениями полей действие договора <<с>> @по',
    })
    @ApiResponse({
        status: 200,
    })
    @ApiBody({ type: BxWebHookDto })
    @ApiQuery({ type: 'number', name: 'dealId', required: false })
    @ApiQuery({
        type: 'boolean',
        name: 'withTasks',
        required: false,
        description:
            'Ставить ли задачи-предупреждения ответственному (по умолчанию true). Передайте false, чтобы синхронизировать акты без задач.',
    })
    async actualizeForDeal(
        @Body() body: BxWebHookDto,
        @Query('dealId') dealId: number,
        @Query('withTasks') withTasks?: string,
    ) {
        const domain = body.auth.domain;
        // console.log('sendMessageWebhook', domain, dealId);
        // return await this.useCase.execute(domain, dealId);
        return await this.smartActQueueService.send(
            domain,
            withTasks !== 'false',
            dealId,
        );
    }

    @Post('ork-deal-acts-webhook')
    @ApiOperation({
        summary: 'Send message',
        description:
            'Обрабатывает финансову. информацию в сделке. Приводит в сделке все акты и количество товара в соответствии со значениями полей действие договора <<с>> @по',
    })
    @ApiResponse({
        status: 200,
    })
    @ApiBody({ type: BxWebHookDto })
    @ApiQuery({ type: 'number', name: 'dealId', required: false })
    @ApiQuery({
        type: 'boolean',
        name: 'withTasks',
        required: false,
        description:
            'Ставить ли задачи-предупреждения ответственному (по умолчанию true). Передайте false, чтобы синхронизировать акты без задач.',
    })
    async actualizeForDeals(
        @Body() body: BxWebHookDto,
        @Query('withTasks') withTasks?: string,
    ) {
        const domain = body.auth.domain;
        // console.log('sendMessageWebhook', domain, dealId);
        // return await this.useCase.execute(domain, dealId);
        return await this.smartActQueueService.send(
            domain,
            withTasks !== 'false',
            undefined,
        );
    }
}
