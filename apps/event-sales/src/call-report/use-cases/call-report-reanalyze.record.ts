/**
 * Переразбор истории (этап 1B): сборка новой записи `agent-analysis`,
 * оценка стоимости dryRun и пары «старый разбор — переразбор» для отчёта
 * согласия версий. Отбор кандидатов и статус — `call-report-reanalyze.util.ts`.
 *
 * Без DI, Bitrix и `new Date()`.
 */
import {
    AiService,
    pickActiveAnalysis,
    type TranscriptionPipelineView,
} from '@lib/call-lib';
import {
    REANALYSIS_DEFAULTS,
    REANALYSIS_PROVIDER,
    versionSeriesDate,
    type AnalysisVersions,
    type ReanalysisCostEstimate,
    type VersionAgreementPair,
} from '@lib/sales-ai-analytics';
import type { AgentCallAnalysisDto } from '../../agent-gate/dto/agent-analysis-request.dto';
import { buildAgentAnalysisRecord } from '../../agent-gate/services/agent-analysis-smart-input.mapper';
import type { AnalysisUsageColumns } from '../../agent-gate/services/agent-analysis-usage.util';
import {
    analysisByTranscription,
    type ReanalysisRecordView,
} from './call-report-reanalyze.util';
import { promptVersionOf, toAgreementPair } from './call-report-retest.util';

const PRICE_DECIMALS = 4;

/** Строковое поле нагрузки записи; нет или пусто — null. */
function stringField(source: unknown, field: string): string | null {
    if (typeof source !== 'object' || source === null) return null;
    const value = (source as Record<string, unknown>)[field];
    return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * Новая запись `agent-analysis` переразбора: раскладка та же, что у
 * приёма (buildAgentAnalysisRecord), поверх — версии, `reanalysisOf`,
 * провайдер переразбора и ссылки старой записи (карточка смарта, дело,
 * сущность, владелец): карточку в Битриксе не трогаем, ссылки витрины
 * должны продолжать работать.
 */
export function buildReanalysisRecord(input: {
    row: TranscriptionPipelineView;
    old: ReanalysisRecordView;
    dto: AgentCallAnalysisDto;
    versions: AnalysisVersions;
    usage: AnalysisUsageColumns;
    model: string | null;
}): Parameters<AiService['create']>[0] {
    const { row, old, versions, usage } = input;
    const dto: AgentCallAnalysisDto = { ...input.dto, versions };
    const classifierCallType = stringField(
        old.user_result,
        'classifierCallType',
    );
    const base = buildAgentAnalysisRecord({
        row,
        agentName: REANALYSIS_PROVIDER,
        dto,
        classifierCallType,
        classifierMismatch:
            classifierCallType !== null && classifierCallType !== dto.callType,
        usage,
    });
    return {
        ...base,
        model: input.model ?? REANALYSIS_PROVIDER,
        app: REANALYSIS_DEFAULTS.app,
        user_result: {
            ...(base.user_result as Record<string, unknown>),
            reanalysisOf: old.id,
        },
        report_item_id: old.report_item_id || undefined,
        in_report: Boolean(old.report_item_id),
        activity_id: old.activity_id || base.activity_id,
        entity_type: old.entity_type || base.entity_type,
        entity_id: old.entity_id || base.entity_id,
        user_id: old.user_id || undefined,
    };
}

const round = (value: number, decimals: number): number =>
    Math.round(value * 10 ** decimals) / 10 ** decimals;

/**
 * Оценка стоимости dryRun по недавним разборам домена с учётом токенов;
 * таких нет — честно «оценки нет».
 */
export function estimateReanalysisCost(
    recent: readonly { tokens_count: number; price: number }[],
    candidates: number,
): ReanalysisCostEstimate {
    const withTokens = recent.filter(record => record.tokens_count > 0);
    if (withTokens.length === 0) {
        return {
            basedOnRecords: 0,
            avgTokens: null,
            avgPrice: null,
            estimatedTokens: null,
            estimatedPrice: null,
            message:
                'Оценки нет: у разборов домена ещё нет учёта токенов — ' +
                'появится после первых разборов текущей версии.',
        };
    }
    const total = (
        pick: (record: { tokens_count: number; price: number }) => number,
    ): number => withTokens.reduce((sum, record) => sum + pick(record), 0);
    const avgTokens = Math.round(
        total(r => r.tokens_count) / withTokens.length,
    );
    const avgPrice = round(
        total(r => r.price) / withTokens.length,
        PRICE_DECIMALS,
    );
    return {
        basedOnRecords: withTokens.length,
        avgTokens,
        avgPrice,
        estimatedTokens: avgTokens * candidates,
        estimatedPrice: round(avgPrice * candidates, 2),
        message:
            `Среднее по ${withTokens.length} недавним разборам: ` +
            `${avgTokens} токенов, ${avgPrice} ₽ за звонок.`,
    };
}

/**
 * Пары «старый разбор — переразбор» по записям окна, сгруппированные по
 * серии старого промпта (null — версий не было): активная запись с
 * `reanalysisOf` + запись с этим id. Прошлые части и запуски входят — отчёт
 * покрывает всё окно.
 */
export function pairsBySeries(
    records: readonly ReanalysisRecordView[],
): Map<string | null, VersionAgreementPair[]> {
    const result = new Map<string | null, VersionAgreementPair[]>();
    for (const [transcriptionId, own] of analysisByTranscription(records)) {
        const fresh = pickActiveAnalysis(own);
        const oldId =
            fresh === null
                ? null
                : stringField(fresh.user_result, 'reanalysisOf');
        const old = oldId === null ? undefined : own.find(r => r.id === oldId);
        if (fresh === null || old === undefined) continue;
        const pair = toAgreementPair(
            transcriptionId,
            old.user_result,
            fresh.user_result,
        );
        if (pair === null) continue;
        const firstPromptVersion = promptVersionOf(old.user_result);
        const series =
            firstPromptVersion === null
                ? null
                : versionSeriesDate(firstPromptVersion);
        const list = result.get(series) ?? [];
        list.push({ ...pair, firstPromptVersion });
        result.set(series, list);
    }
    return result;
}
