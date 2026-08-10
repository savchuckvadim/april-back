import { Injectable, Logger } from '@nestjs/common';
import { getErrorDetails } from '@/shared';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import {
    DuplicateSearchLevel,
    DuplicateSearchResult,
    DuplicateSearchService,
} from '@lib/portal-lib/pbx-duplicate';
import { EnumSalesHookCode } from '../../core/constants/sales-hook-code.enum';
import {
    ISalesHookUseCase,
    SalesHookExecutionContext,
} from '../../core/contracts/sales-hook-use-case.contract';
import {
    DUPLICATE_CHECK_ENTITY_MAP,
    DuplicateCheckEntityType,
    IDuplicateCheckItem,
} from '../dto/duplicate-check.dto';
import {
    DuplicateCheckItemResultDto,
    DuplicateCheckResultDto,
} from '../dto/duplicate-check-result.dto';
import {
    entityCardUrl,
    formatDuplicateTimelineComment,
} from '../lib/duplicate-timeline.formatter';

type BxRow = Record<string, unknown>;

const LEVEL_TITLES: Record<IDuplicateCheckItem['level'], string> = {
    fast: 'быстрая',
    deep: 'глубокая',
};

/**
 * Хук «проверить на дубли из сущности».
 *
 * Принимает тип+id сущности-источника, прогоняет поиск дублей (по
 * умолчанию DEEP: реквизиты + подстрока названия) и пишет «умеренно
 * красивый» итог комментарием в timeline ЭТОЙ сущности: заголовок,
 * нумерованные кандидаты с признаками совпадения и ссылками на карточки,
 * сводка сигналов.
 *
 * Для лида дополнительно проставляются маркеры op_lead_is_duplicate_check
 * и op_lead_is_duplicate (graceful: поля не установлены — скип).
 *
 * Идемпотентность доменная: сам поиск read-only, timeline-комментарий —
 * новый факт проверки (повторная проверка = новый комментарий, это
 * ожидаемое поведение кнопки «проверить ещё раз»).
 */
@Injectable()
export class DuplicateCheckUseCase
    implements ISalesHookUseCase<IDuplicateCheckItem, DuplicateCheckResultDto>
{
    readonly hook = EnumSalesHookCode.DUPLICATE_CHECK;
    private readonly logger = new Logger(DuplicateCheckUseCase.name);

    constructor(private readonly search: DuplicateSearchService) {}

    async execute(
        ctx: SalesHookExecutionContext,
        items: IDuplicateCheckItem[],
    ): Promise<DuplicateCheckResultDto> {
        const results: DuplicateCheckItemResultDto[] = [];

        for (const item of items) {
            try {
                results.push(await this.checkOne(ctx, item));
            } catch (error) {
                const { message } = getErrorDetails(error);
                this.logger.warn(
                    `duplicate-check: ${item.entityType}:${item.entityId} — ${message}`,
                );
                results.push({
                    entityType: item.entityType,
                    entityId: item.entityId,
                    candidatesFound: 0,
                    candidates: [],
                    timelineWritten: false,
                    leadFlagsWritten: false,
                    warnings: [`Ошибка: ${message}`],
                });
            }
        }

        // Записи timeline/лида поставлены группами — отправляем и получаем
        // ответы здесь (повторный flush в runner — no-op).
        await ctx.buffer.flush();

        const found = results.reduce((sum, r) => sum + r.candidatesFound, 0);
        return {
            implemented: true,
            items: results,
            message: `Проверено сущностей: ${results.length}, найдено дублей: ${found}.`,
        };
    }

    private async checkOne(
        ctx: SalesHookExecutionContext,
        item: IDuplicateCheckItem,
    ): Promise<DuplicateCheckItemResultDto> {
        // Поиск read-only; force — кнопка «проверить» должна проверять
        // заново, а не отдавать 2-минутный кэш фрейма.
        const result = await this.search.search(ctx.domain, {
            entityType: DUPLICATE_CHECK_ENTITY_MAP[item.entityType],
            entityId: item.entityId,
            level:
                item.level === 'fast'
                    ? DuplicateSearchLevel.FAST
                    : DuplicateSearchLevel.DEEP,
            force: true,
        });

        const warnings = [...result.warnings];
        let timelineWritten = false;
        let leadFlagsWritten = false;

        if (item.writeTimeline === 'Y') {
            const comment = formatDuplicateTimelineComment(
                ctx.domain,
                result,
                LEVEL_TITLES[item.level],
            );
            ctx.buffer.queue(() =>
                ctx.bitrix.batch.timeline.addTimelineComment(
                    `dup_tl_${item.entityType}_${item.entityId}`,
                    {
                        ENTITY_TYPE: item.entityType,
                        ENTITY_ID: item.entityId,
                        COMMENT: comment,
                    },
                ),
            );
            timelineWritten = true;
        }

        if (item.entityType === 'lead') {
            leadFlagsWritten = this.queueLeadFlags(ctx, item, result, warnings);
        }

        await ctx.buffer.endGroup();

        return {
            entityType: item.entityType,
            entityId: item.entityId,
            candidatesFound: result.candidates.length,
            candidates: result.candidates.map(candidate => ({
                entityType:
                    candidate.entityType.toLowerCase() as DuplicateCheckEntityType,
                id: candidate.id,
                title: candidate.title ?? null,
                score: candidate.score,
                url: entityCardUrl(
                    ctx.domain,
                    candidate.entityType,
                    candidate.id,
                ),
            })),
            timelineWritten,
            leadFlagsWritten,
            warnings,
        };
    }

    /**
     * Маркеры лида: «проверка была» + «дубль найден/нет». Поля не
     * установлены на портале → скип с warning (graceful degradation).
     */
    private queueLeadFlags(
        ctx: SalesHookExecutionContext,
        item: IDuplicateCheckItem,
        result: DuplicateSearchResult,
        warnings: string[],
    ): boolean {
        const fields: BxRow = {};
        const checkField = ctx.portal.getEntityFieldByCode(
            'lead',
            PBX_SALES_EVENT_FIELD_CODES.op_lead_is_duplicate_check,
        );
        if (checkField) {
            fields[ctx.portal.getFieldBitrixId(checkField)] = 1;
        }
        const dupField = ctx.portal.getEntityFieldByCode(
            'lead',
            PBX_SALES_EVENT_FIELD_CODES.op_lead_is_duplicate,
        );
        if (dupField) {
            fields[ctx.portal.getFieldBitrixId(dupField)] =
                result.candidates.length > 0 ? 1 : 0;
        }

        if (Object.keys(fields).length === 0) {
            warnings.push(
                'Поля op_lead_is_duplicate_check/op_lead_is_duplicate не установлены — маркеры лида пропущены',
            );
            return false;
        }
        ctx.buffer.queue(() =>
            ctx.bitrix.batch.lead.update(
                `dup_lead_flags_${item.entityId}`,
                item.entityId,
                fields as never,
            ),
        );
        return true;
    }
}
