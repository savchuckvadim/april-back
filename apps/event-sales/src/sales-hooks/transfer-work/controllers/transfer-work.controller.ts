import {
    BadRequestException,
    Body,
    ConflictException,
    Controller,
    HttpCode,
    Post,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SalesHookDispatchService } from '../../core/services/sales-hook-dispatch.service';
import { SalesHookIdempotencyService } from '../../core/services/sales-hook-idempotency.service';
import { EnumSalesHookCode } from '../../core/constants/sales-hook-code.enum';
import { EnumSalesHookSource } from '../../core/contracts/sales-hook-job.type';
import { SalesHookOperationDto } from '../../core/dto/sales-hook-operation.dto';
import {
    buildTransferWorkItem,
    ITransferWorkItem,
    TransferWorkAction,
    TransferWorkRunDto,
} from '../dto/transfer-work.dto';
import { TransferWorkOperationDto } from '../dto/transfer-work-result.dto';

const HOOK = EnumSalesHookCode.TRANSFER_WORK;

/**
 * Хук 2.2 «передать работу»: компания и/или сделки + задачи переезжают
 * к новому ответственному. Два маршрута с одинаковым телом — /give (менеджер
 * отдаёт свою работу) и /take (руководитель забирает чужую): разделение по
 * ДЕЙСТВИЮ, чтобы права можно было навесить позже без переименования путей.
 */
@ApiTags('Sales hooks')
@Controller('sales-hooks/transfer-work')
export class TransferWorkController {
    constructor(
        private readonly dispatch: SalesHookDispatchService,
        private readonly idempotency: SalesHookIdempotencyService,
    ) {}

    @Post('give')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Отдать работу (инициатива владельца)',
        description:
            'Менеджер передаёт свою компанию/сделки новому ответственному. ' +
            'Открытые задачи и сделки наших воронок переезжают; KPI-история ' +
            'не изменяется. Статус — GET /sales-hooks/operations/{id} или WS.',
    })
    @ApiBody({
        type: TransferWorkRunDto,
        description: 'Компания и/или сделки, новый ответственный, флаги.',
    })
    @ApiOkResponse({
        type: TransferWorkOperationDto,
        description: 'Операция поставлена (или возвращена существующая).',
    })
    give(@Body() dto: TransferWorkRunDto): Promise<SalesHookOperationDto> {
        return this.accept('give', dto);
    }

    @Post('take')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Забрать работу (инициатива руководителя)',
        description:
            'Руководитель передаёт чужую компанию/сделки выбранному ' +
            'менеджеру. Тело идентично /give; отдельный маршрут — задел ' +
            'под разные права на «отдать» и «забрать».',
    })
    @ApiBody({
        type: TransferWorkRunDto,
        description: 'Компания и/или сделки, новый ответственный, флаги.',
    })
    @ApiOkResponse({
        type: TransferWorkOperationDto,
        description: 'Операция поставлена (или возвращена существующая).',
    })
    take(@Body() dto: TransferWorkRunDto): Promise<SalesHookOperationDto> {
        return this.accept('take', dto);
    }

    private async accept(
        action: TransferWorkAction,
        dto: TransferWorkRunDto,
    ): Promise<SalesHookOperationDto> {
        if (!dto.companyId && !dto.dealIds?.length) {
            throw new BadRequestException(
                'Укажите companyId и/или dealIds — иначе нечего передавать',
            );
        }
        const item = buildTransferWorkItem(action, dto);
        const entityKey = item.companyId
            ? `company:${item.companyId}`
            : `deals:${[...(item.dealIds ?? [])].sort((a, b) => a - b).join('+')}`;
        const operation = await this.dispatch.accept<ITransferWorkItem>(
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
                'Эта работа только что передавалась другой операцией — повторите запрос',
            );
        }
        return operation;
    }
}
