import {
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
    IMergeDuplicatesItem,
    MergeDuplicatesRunDto,
} from '../dto/merge-duplicates.dto';
import { MergeDuplicatesOperationDto } from '../dto/merge-duplicates-result.dto';

const HOOK = EnumSalesHookCode.MERGE_DUPLICATES;

/**
 * Хук 2.1 «смержить дубли»: объединение однотипных сущностей через
 * crm.entity.mergeBatch + перепривязка разнотипных. Только кнопка
 * руководителя (робот-пути нет: merge требует явного человеческого
 * решения и dry-run подтверждения).
 */
@ApiTags('Sales hooks')
@Controller('sales-hooks/merge-duplicates')
export class MergeDuplicatesController {
    constructor(
        private readonly dispatch: SalesHookDispatchService,
        private readonly idempotency: SalesHookIdempotencyService,
    ) {}

    @Post('run')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Смержить дубли (кнопка руководителя)',
        description:
            'Ставит операцию объединения в очередь. dryRun=true (по ' +
            'умолчанию) — только расчёт плана, без записи. Реальный merge ' +
            'требует dryRun=false и planHash из dry-run-ответа: сущности-' +
            'жертвы удаляются безвозвратно. Статус — ' +
            'GET /sales-hooks/operations/{operationId} или WS.',
    })
    @ApiBody({
        type: MergeDuplicatesRunDto,
        description: 'Ссылки на объединяемые сущности и режим dry-run.',
    })
    @ApiOkResponse({
        type: MergeDuplicatesOperationDto,
        description: 'Операция поставлена (или возвращена существующая).',
    })
    async run(
        @Body() dto: MergeDuplicatesRunDto,
    ): Promise<SalesHookOperationDto> {
        const item: IMergeDuplicatesItem = {
            entityRefs: [...dto.entityRefs].sort(),
            dryRun: dto.dryRun ?? true,
            planHash: dto.planHash,
        };
        // Режим в ключе: exec сразу после dryRun не должен схлопнуться
        // alias'ом двойного клика в старую dry-операцию.
        const entityKey = `merge:${item.entityRefs.join('+')}:${item.dryRun ? 'dry' : 'exec'}`;
        const operation = await this.dispatch.accept<IMergeDuplicatesItem>(
            HOOK,
            dto.domain,
            EnumSalesHookSource.FRAME,
            [
                {
                    entityKey,
                    fingerprint: this.idempotency.fingerprint(HOOK, entityKey, {
                        dryRun: item.dryRun,
                        planHash: item.planHash,
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
                'Эти сущности только что обрабатывались другой операцией — повторите запрос',
            );
        }
        return operation;
    }
}
