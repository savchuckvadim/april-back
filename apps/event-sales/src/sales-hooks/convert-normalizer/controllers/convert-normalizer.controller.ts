import {
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
    ConvertNormalizerOperationDto,
    ConvertNormalizerRunDto,
    ConvertNormalizerWebhookQueryDto,
    IConvertNormalizerItem,
} from '../dto/convert-normalizer.dto';

const HOOK = EnumSalesHookCode.CONVERT_NORMALIZER;

/**
 * Нормализатор ручной конвертации: робот onCrmDealAdd шлёт сюда каждую
 * новую сделку; сделки из конвертации (LEAD_ID есть, наши поля пусты)
 * получают дописанный граф связей. Остальные проходят насквозь без записи.
 */
@ApiTags('Sales hooks')
@Controller('sales-hooks/convert-normalizer')
export class ConvertNormalizerController {
    constructor(
        private readonly silence: SalesHookSilenceGateway,
        private readonly dispatch: SalesHookDispatchService,
        private readonly idempotency: SalesHookIdempotencyService,
    ) {}

    @Post('webhook')
    @HttpCode(200)
    @UseGuards(SalesHookWebhookGuard)
    @ApiOperation({
        summary: 'Вебхук робота onCrmDealAdd: нормализация графа связей',
        description:
            'Принимает созданную сделку в silence-буфер. Если сделка ' +
            'родилась ручной конвертацией лида — наши поля графа ' +
            '(deal_from_lead_id, deal_joined_leads, to_base_sales лида) ' +
            'дописываются self-healing. Дубли от конвертации попадают в ' +
            'warnings как кандидаты на merge.',
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
        @Query() query: ConvertNormalizerWebhookQueryDto,
    ): Promise<SalesHookAcceptedDto> {
        const domain = body.auth.domain;
        const entityKey = `deal:${query.dealId}`;
        const keyPrefix = await this.silence.accept<IConvertNormalizerItem>(
            HOOK,
            domain,
            String(query.dealId),
            { entityKey, data: { dealId: query.dealId } },
        );
        return { accepted: true, hook: HOOK, domain, keyPrefix };
    }

    @Post('run')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Ручной запуск нормализатора (отладка/догон истории)',
        description:
            'Нормализует конкретную сделку без silence-задержки. Статус — ' +
            'GET /sales-hooks/operations/{operationId} или WS.',
    })
    @ApiBody({
        type: ConvertNormalizerRunDto,
        description: 'Сделка для нормализации.',
    })
    @ApiOkResponse({
        type: ConvertNormalizerOperationDto,
        description: 'Операция поставлена (или возвращена существующая).',
    })
    async run(
        @Body() dto: ConvertNormalizerRunDto,
    ): Promise<SalesHookOperationDto> {
        const entityKey = `deal:${dto.dealId}`;
        const operation = await this.dispatch.accept<IConvertNormalizerItem>(
            HOOK,
            dto.domain,
            EnumSalesHookSource.FRAME,
            [
                {
                    entityKey,
                    fingerprint: this.idempotency.fingerprint(HOOK, entityKey),
                    data: { dealId: dto.dealId },
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
                'Эта сделка только что нормализовалась другой операцией — повторите запрос',
            );
        }
        return operation;
    }
}
