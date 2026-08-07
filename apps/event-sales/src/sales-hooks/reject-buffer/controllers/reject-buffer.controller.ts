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
    IRejectBufferItem,
    RejectBufferRunDto,
    RejectBufferWebhookQueryDto,
} from '../dto/reject-buffer.dto';
import { RejectBufferOperationDto } from '../dto/reject-buffer-result.dto';

const HOOK = EnumSalesHookCode.REJECT_BUFFER;

/**
 * Хук 2.3 «в буфер отказников»: основная сделка — в «Отказ», остальные
 * наши — в «не состоялось». Два пути: вебхук робота (silence) и кнопка.
 */
@ApiTags('Sales hooks')
@Controller('sales-hooks/reject-buffer')
export class RejectBufferController {
    constructor(
        private readonly silence: SalesHookSilenceGateway,
        private readonly dispatch: SalesHookDispatchService,
        private readonly idempotency: SalesHookIdempotencyService,
    ) {}

    @Post('webhook')
    @HttpCode(200)
    @UseGuards(SalesHookWebhookGuard)
    @ApiOperation({
        summary: 'Вебхук робота: в буфер отказников',
        description:
            'Принимает событие робота в silence-буфер (burst по одной ' +
            'компании схлопывается). Ответ — факт приёма.',
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
        @Query() query: RejectBufferWebhookQueryDto,
    ): Promise<SalesHookAcceptedDto> {
        const domain = body.auth.domain;
        const item: IRejectBufferItem = {
            companyId: query.companyId,
            reasonCode: query.reasonCode,
            taskMode: 'complete',
        };
        const entityKey = `company:${query.companyId}`;
        const keyPrefix = await this.silence.accept<IRejectBufferItem>(
            HOOK,
            domain,
            String(query.companyId),
            { entityKey, data: item },
        );
        return { accepted: true, hook: HOOK, domain, keyPrefix };
    }

    @Post('run')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Кнопка фрейма: в буфер отказников',
        description:
            'Ставит операцию в очередь без silence-задержки. Статус — ' +
            'GET /sales-hooks/operations/{operationId} или WS.',
    })
    @ApiBody({
        type: RejectBufferRunDto,
        description: 'Компания и/или сделки, причина, режим задач.',
    })
    @ApiOkResponse({
        type: RejectBufferOperationDto,
        description: 'Операция поставлена (или возвращена существующая).',
    })
    async run(@Body() dto: RejectBufferRunDto): Promise<SalesHookOperationDto> {
        if (!dto.companyId && !dto.dealIds?.length) {
            throw new BadRequestException(
                'Укажите companyId и/или dealIds — иначе нечего отправлять в буфер',
            );
        }
        const item: IRejectBufferItem = {
            companyId: dto.companyId,
            dealIds: dto.dealIds,
            reasonCode: dto.reasonCode,
            taskMode: dto.taskMode ?? 'complete',
        };
        const entityKey = item.companyId
            ? `company:${item.companyId}`
            : `deals:${[...(item.dealIds ?? [])].sort((a, b) => a - b).join('+')}`;
        const operation = await this.dispatch.accept<IRejectBufferItem>(
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
                'Эта компания только что обрабатывалась другой операцией — повторите запрос',
            );
        }
        return operation;
    }
}
