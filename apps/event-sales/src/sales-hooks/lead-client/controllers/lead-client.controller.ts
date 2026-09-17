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
    ILeadClientItem,
    LeadClientRunDto,
    LeadClientWebhookQueryDto,
} from '../dto/lead-client.dto';
import { LeadClientOperationDto } from '../dto/lead-client-result.dto';

const HOOK = EnumSalesHookCode.LEAD_CLIENT;

const DESCRIPTION =
    'Для каждого лида сделки: у лида без клиента создаётся контакт ' +
    '(или компания — по параметру kind либо настройкам портала), ' +
    'привязывается к лиду (телефоны и почта уезжают в клиента) и к ' +
    'сделке; дела лида привязываются к сделке и клиенту — звонки видны ' +
    'в сделке. Заодно переносятся данные заявки. Лид остаётся открытым. ' +
    'Повторный запуск ничего не дублирует.';

/** Клиент из лида: контакт или компания для сделки. */
@ApiTags('Sales hooks')
@Controller('sales-hooks/lead-client')
export class LeadClientController {
    constructor(
        private readonly silence: SalesHookSilenceGateway,
        private readonly dispatch: SalesHookDispatchService,
        private readonly idempotency: SalesHookIdempotencyService,
    ) {}

    @Post('webhook')
    @HttpCode(200)
    @UseGuards(SalesHookWebhookGuard)
    @ApiOperation({
        summary: 'Вебхук робота: клиент из лида для сделки',
        description: DESCRIPTION,
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
        @Query() query: LeadClientWebhookQueryDto,
    ): Promise<SalesHookAcceptedDto> {
        const domain = body.auth.domain;
        const keyPrefix = await this.silence.accept<ILeadClientItem>(
            HOOK,
            domain,
            String(query.dealId),
            {
                entityKey: `deal:${query.dealId}`,
                data: { dealId: query.dealId, kind: query.kind },
            },
        );
        return { accepted: true, hook: HOOK, domain, keyPrefix };
    }

    @Post('run')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Ручной запуск: клиент из лида для сделки',
        description: `${DESCRIPTION} Статус — GET /sales-hooks/operations/{operationId} или WS.`,
    })
    @ApiBody({ type: LeadClientRunDto, description: 'Сделка и вид клиента.' })
    @ApiOkResponse({
        type: LeadClientOperationDto,
        description: 'Операция поставлена (или возвращена существующая).',
    })
    async run(@Body() dto: LeadClientRunDto): Promise<SalesHookOperationDto> {
        const entityKey = `deal:${dto.dealId}`;
        const data: ILeadClientItem = { dealId: dto.dealId, kind: dto.kind };
        const operation = await this.dispatch.accept<ILeadClientItem>(
            HOOK,
            dto.domain,
            EnumSalesHookSource.FRAME,
            [
                {
                    entityKey,
                    fingerprint: this.idempotency.fingerprint(HOOK, entityKey, {
                        kind: dto.kind ?? 'auto',
                    }),
                    data,
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
                'По этой сделке клиент уже создаётся другой операцией — повторите запрос',
            );
        }
        return operation;
    }
}
