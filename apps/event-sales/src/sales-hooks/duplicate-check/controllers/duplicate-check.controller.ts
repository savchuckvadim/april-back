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
    buildDuplicateCheckItem,
    DuplicateCheckRunDto,
    DuplicateCheckWebhookQueryDto,
    IDuplicateCheckItem,
} from '../dto/duplicate-check.dto';
import { DuplicateCheckOperationDto } from '../dto/duplicate-check-result.dto';

const HOOK = EnumSalesHookCode.DUPLICATE_CHECK;

/**
 * Хук «проверить на дубли»: принимает тип+id сущности-источника, проводит
 * глубокую проверку (реквизиты, ИНН, подстрока названия) и пишет итог
 * комментарием в timeline этой сущности — с признаками совпадения и
 * ссылками на карточки кандидатов.
 */
@ApiTags('Sales hooks')
@Controller('sales-hooks/duplicate-check')
export class DuplicateCheckController {
    constructor(
        private readonly silence: SalesHookSilenceGateway,
        private readonly dispatch: SalesHookDispatchService,
        private readonly idempotency: SalesHookIdempotencyService,
    ) {}

    @Post('webhook')
    @HttpCode(200)
    @UseGuards(SalesHookWebhookGuard)
    @ApiOperation({
        summary: 'Вебхук робота: проверить сущность на дубли',
        description:
            'Принимает событие в silence-буфер (окно тишины схлопывает ' +
            'burst по одной сущности). Итог проверки будет записан ' +
            'комментарием в timeline сущности-источника.',
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
        @Query() query: DuplicateCheckWebhookQueryDto,
    ): Promise<SalesHookAcceptedDto> {
        const domain = body.auth.domain;
        const item = buildDuplicateCheckItem(query);
        const entityKey = `${item.entityType}:${item.entityId}`;
        const keyPrefix = await this.silence.accept<IDuplicateCheckItem>(
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
        summary: 'Кнопка фрейма: проверить сущность на дубли',
        description:
            'Ставит операцию в очередь без silence-задержки. Статус — ' +
            'GET /sales-hooks/operations/{operationId} или WS-события ' +
            'sales-hook:done / sales-hook:error. Итог пишется в timeline ' +
            'сущности (отключается writeTimeline=N).',
    })
    @ApiBody({
        type: DuplicateCheckRunDto,
        description: 'Сущность-источник проверки и глубина.',
    })
    @ApiOkResponse({
        type: DuplicateCheckOperationDto,
        description: 'Операция поставлена (или возвращена существующая).',
    })
    async run(
        @Body() dto: DuplicateCheckRunDto,
    ): Promise<SalesHookOperationDto> {
        const item = buildDuplicateCheckItem(dto);
        const entityKey = `${item.entityType}:${item.entityId}`;
        const operation = await this.dispatch.accept<IDuplicateCheckItem>(
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
                'Эта сущность только что проверялась другой операцией — повторите запрос',
            );
        }
        return operation;
    }
}
