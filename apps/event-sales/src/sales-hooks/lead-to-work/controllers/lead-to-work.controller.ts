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
    buildLeadToWorkItem,
    ILeadToWorkItem,
    LeadToWorkRunDto,
    LeadToWorkWebhookQueryDto,
} from '../dto/lead-to-work.dto';
import { LeadToWorkOperationDto } from '../dto/lead-to-work-result.dto';

const HOOK = EnumSalesHookCode.LEAD_TO_WORK;

/**
 * Хук «лид → работа»: преобразование лида в работу отдела продаж
 * (компания по флагу, сделка ОП, задача «Звонок», стадия лида) — не
 * обнуляющий аналог ХО. Два пути: вебхук робота (silence) и кнопка фрейма
 * (очередь + operationId + поллинг/WS).
 */
@ApiTags('Sales hooks')
@Controller('sales-hooks/lead-to-work')
export class LeadToWorkController {
    constructor(
        private readonly silence: SalesHookSilenceGateway,
        private readonly dispatch: SalesHookDispatchService,
        private readonly idempotency: SalesHookIdempotencyService,
    ) {}

    @Post('webhook')
    @HttpCode(200)
    @UseGuards(SalesHookWebhookGuard)
    @ApiOperation({
        summary: 'Вебхук робота: лид → работа',
        description:
            'Принимает событие робота Битрикс в silence-буфер (окно тишины ' +
            '1.5 с схлопывает burst по одному лиду). Ответ — факт приёма; ' +
            'обработка выполнится после окна тишины операцией в очереди.',
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
        @Query() query: LeadToWorkWebhookQueryDto,
    ): Promise<SalesHookAcceptedDto> {
        const domain = body.auth.domain;
        const item = buildLeadToWorkItem(query);
        const entityKey = `lead:${item.leadId}`;
        const keyPrefix = await this.silence.accept<ILeadToWorkItem>(
            HOOK,
            domain,
            String(item.leadId),
            { entityKey, data: item },
        );
        return { accepted: true, hook: HOOK, domain, keyPrefix };
    }

    @Post('run')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Кнопка фрейма: лид → работа',
        description:
            'Ставит операцию в очередь без silence-задержки. Повторный POST ' +
            'с тем же operationId вернёт существующую операцию. Статус — ' +
            'GET /sales-hooks/operations/{operationId} или WS-события ' +
            'sales-hook:done / sales-hook:error.',
    })
    @ApiBody({
        type: LeadToWorkRunDto,
        description: 'Лид, ответственный и флаги преобразования.',
    })
    @ApiOkResponse({
        type: LeadToWorkOperationDto,
        description: 'Операция поставлена (или возвращена существующая).',
    })
    async run(@Body() dto: LeadToWorkRunDto): Promise<SalesHookOperationDto> {
        const item = buildLeadToWorkItem(dto);
        const entityKey = `lead:${item.leadId}`;
        const operation = await this.dispatch.accept<ILeadToWorkItem>(
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
            // Крайний случай: элемент недавно принят другой операцией,
            // но её статус уже истёк — просим повторить с новым operationId.
            throw new ConflictException(
                'Этот лид только что обрабатывался другой операцией — повторите запрос',
            );
        }
        return operation;
    }
}
