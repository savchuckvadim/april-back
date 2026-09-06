/**
 * «Внимание» РОПу над строками обзора (план §3, ТЗ FR-12): строка →
 * AttentionManagerInput (n, звонки в телефонии, доля «шаг с датой» за два
 * окна, риск-звонки, дисциплина CRM) → buildAttention lib → карточки.
 * Строки приходят уже в периметре requester'а, поэтому карточки в нём же.
 * planGap / outcomes / levelNorms — с Фазы 2 (норм пока нет).
 */
import { AttentionManagerInput, buildAttention } from '@lib/sales-ai-analytics';
import { AiAttentionDto, AiAttentionItemDto } from '../../dto/ai-attention.dto';
import { AiManagerRowDto } from '../../dto/ai-manager-row.dto';
import { AiOverviewDto } from '../../dto/ai-overview.dto';

export function toAttentionInput(row: AiManagerRowDto): AttentionManagerInput {
    return {
        managerId: row.managerId,
        n: row.analyzedCalls,
        callsTotal: row.callsTotal,
        nextStepRate: {
            current: row.nextStepRate.current,
            previous: row.nextStepRate.previous,
        },
        riskCalls: row.riskCalls.map(call => ({
            transcriptionId: call.transcriptionId,
            kind: call.kind,
        })),
        discipline: row.discipline,
    };
}

/** Карточки по строкам (≤ 7, ≤ 3 на менеджера, ранг с 1). */
export function buildAttentionItems(
    rows: readonly AiManagerRowDto[],
): AiAttentionItemDto[] {
    return buildAttention({ managers: rows.map(toAttentionInput) });
}

/** Старшая (по рангу) карточка каждого менеджера — для signal строки. */
export function topSignalByManager(
    items: readonly AiAttentionItemDto[],
): Map<string, AiAttentionItemDto> {
    const top = new Map<string, AiAttentionItemDto>();
    for (const item of items) {
        if (!top.has(item.managerId)) top.set(item.managerId, item);
    }
    return top;
}

/** Строки с проставленным signal. */
export function withSignals(
    rows: readonly AiManagerRowDto[],
): AiManagerRowDto[] {
    const top = topSignalByManager(buildAttentionItems(rows));
    return rows.map(row => ({
        ...row,
        signal: top.get(row.managerId) ?? null,
    }));
}

/** «Внимание» из обзора, уже отфильтрованного по периметру. */
export function toAttentionDto(overview: AiOverviewDto): AiAttentionDto {
    return {
        from: overview.period.from,
        to: overview.period.to,
        items: buildAttentionItems(overview.managers),
        managersConsidered: overview.managers.length,
    };
}
