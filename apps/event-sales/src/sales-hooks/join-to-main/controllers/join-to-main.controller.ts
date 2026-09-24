import {
    BadRequestException,
    Body,
    ConflictException,
    Controller,
    HttpCode,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BxWebHookDto } from '@lib/bitrix/dto/bx-webhook.dto';
import { SalesHookSilenceGateway } from '../../core/services/sales-hook-silence.gateway';
import { SalesHookDispatchService } from '../../core/services/sales-hook-dispatch.service';
import { SalesHookIdempotencyService } from '../../core/services/sales-hook-idempotency.service';
import { SalesHookWebhookGuard } from '../../core/guards/sales-hook-webhook.guard';
import { EnumSalesHookCode } from '../../core/constants/sales-hook-code.enum';
import { EnumSalesHookSource } from '../../core/contracts/sales-hook-job.type';
import { SalesHookAcceptedDto } from '../../core/dto/sales-hook-accepted.dto';
import { SalesHookOperationDto } from '../../core/dto/sales-hook-operation.dto';
import {
    buildJoinToMainItem,
    IJoinToMainItem,
    JoinToMainRunDto,
    JoinToMainWebhookQueryDto,
} from '../dto/join-to-main.dto';
import { JoinToMainOperationDto } from '../dto/join-to-main-result.dto';

const HOOK = EnumSalesHookCode.JOIN_TO_MAIN;

/**
 * Хук «присоединить к основной»: сделка-дубль (новая заявка того же клиента)
 * → в открытую работу клиента без удаления. Два входа, как у всех хуков:
 * вебхук робота (query + auth в теле, через silence-буфер) и кнопка фрейма
 * (JSON-тело, очередь без задержки; во фронте — только руководителю).
 */
@ApiTags('Sales hooks')
@Controller('sales-hooks/join-to-main')
export class JoinToMainController {
    constructor(
        private readonly silence: SalesHookSilenceGateway,
        private readonly dispatch: SalesHookDispatchService,
        private readonly idempotency: SalesHookIdempotencyService,
    ) {}

    @Post('webhook')
    @HttpCode(200)
    @UseGuards(SalesHookWebhookGuard)
    @ApiOperation({
        summary: 'Вебхук робота: присоединить сделку-дубль к основной',
        description:
            'Принимает событие в silence-буфер (окно тишины схлопывает ' +
            'burst по одной сделке). Параметры — в query: dealId и одна ' +
            'цель, mainDealId либо companyId. Контакты дубля уходят в ' +
            'компанию и основную сделку, лиды и задачи — ответственному ' +
            'основной, дубль закрывается стадией «Дубль» (closeAsDuplicate=N ' +
            '— остаётся открытым). Ничего не удаляется.',
    })
    @ApiBody({
        type: BxWebHookDto,
        description: 'Стандартное тело вебхука Битрикс (auth.domain).',
    })
    @ApiOkResponse({
        type: SalesHookAcceptedDto,
        description: 'Событие принято в silence-буфер.',
    })
    async webhook(
        @Body() body: BxWebHookDto,
        @Query() query: JoinToMainWebhookQueryDto,
    ): Promise<SalesHookAcceptedDto> {
        const domain = body.auth.domain;
        if (!query.mainDealId && !query.companyId) {
            throw new BadRequestException(
                'Нужна цель присоединения: mainDealId либо companyId',
            );
        }
        const item = buildJoinToMainItem({
            dealId: query.dealId,
            targetType: query.mainDealId ? 'deal' : 'company',
            targetId: query.mainDealId ?? Number(query.companyId),
            closeAsDuplicate: query.closeAsDuplicate !== 'N',
        });
        const entityKey = `deal:${item.dealId}`;
        const keyPrefix = await this.silence.accept<IJoinToMainItem>(
            HOOK,
            domain,
            entityKey,
            { entityKey, data: item },
        );
        return { accepted: true, hook: HOOK, domain, keyPrefix };
    }

    @Post('run')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Кнопка фрейма: присоединить сделку-дубль к основной',
        description:
            'Ставит операцию в очередь без silence-задержки. Статус — ' +
            'GET /sales-hooks/operations/{operationId} или WS-события ' +
            'sales-hook:done / sales-hook:error. Во фронте кнопка доступна ' +
            'только руководителю.',
    })
    @ApiBody({
        type: JoinToMainRunDto,
        description:
            'Сделка-дубль, цель (сделка или компания) и режим закрытия.',
    })
    @ApiOkResponse({
        type: JoinToMainOperationDto,
        description: 'Операция поставлена (или возвращена существующая).',
    })
    async run(@Body() dto: JoinToMainRunDto): Promise<SalesHookOperationDto> {
        const item = buildJoinToMainItem(dto);
        const entityKey = `deal:${item.dealId}`;
        const operation = await this.dispatch.accept<IJoinToMainItem>(
            HOOK,
            dto.domain,
            EnumSalesHookSource.FRAME,
            [
                {
                    entityKey,
                    fingerprint: this.idempotency.fingerprint(HOOK, entityKey, {
                        ...item,
                    }),
                    data: item,
                },
            ],
            {
                operationId: dto.operationId,
                socketId: dto.socketId,
                initiatorUserId: dto.initiatorUserId,
            },
        );
        if (!operation) {
            throw new ConflictException(
                'Эта сделка только что присоединялась другой операцией — повторите запрос',
            );
        }
        return operation;
    }
}
