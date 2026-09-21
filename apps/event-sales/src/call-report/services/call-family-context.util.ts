import {
    AGENT_ANALYSIS_TYPE,
    CALL_CLASSIFY_TYPE,
    type TranscriptionPipelineView,
} from '@lib/call-lib';
import type { CallReportDealFamilyContext } from '@lib/call-lib/call-report/services/call-report-deal-family.service';
import type { CallPassport } from './call-context-builder.service';

/**
 * Контекст раскладки сделок (`CallReportDealFamilyService.resolve`) по
 * паспорту и строке звонка — чистые функции без DI.
 *
 * Эталон полного вызова — приём глубокого разбора
 * (agent-analysis-intake.service.ts): шагу 0 раскладки (элемент
 * «ОП История»/«ОП KPI» ЭТОГО звонка) нужны лид-владелец, владелец звонка
 * из телефонии и тип звонка, а не только клиент. Без них звонок по лиду
 * до записи списка не доходил, и семья дотягивалась догадкой по клиенту.
 */

/** Паспортные поля, из которых собирается контекст раскладки. */
export type CallFamilyPassportRefs = Pick<
    CallPassport,
    'entityType' | 'entityId' | 'crmCompanyId' | 'crmContactId'
>;

/** Строка звонка: владелец из телефонии и момент звонка. */
export type CallFamilyRowRefs = Pick<
    TranscriptionPipelineView,
    'userId' | 'callStartedAt'
>;

/** Аргументы `dealFamily.resolve`: сделка-владелец звонка и контекст. */
export interface CallFamilyResolveArgs {
    /** Сделка-владелец; undefined — звонок по лиду или без привязки. */
    dealId: number | undefined;
    context: CallReportDealFamilyContext;
}

export function familyResolveArgsOf(
    passport: CallFamilyPassportRefs,
    row: CallFamilyRowRefs | null | undefined,
    callType?: string | null,
): CallFamilyResolveArgs {
    const entityId = passport.entityId ?? undefined;
    return {
        dealId: passport.entityType === 'deal' ? entityId : undefined,
        context: {
            companyId: passport.crmCompanyId ?? undefined,
            contactId: passport.crmContactId ?? undefined,
            callStartedAt: row?.callStartedAt ?? undefined,
            leadId: passport.entityType === 'lead' ? entityId : undefined,
            callerId: row?.userId ?? undefined,
            callType: callType ?? undefined,
        },
    };
}

/** Запись ais, из которой читается тип звонка (подмножество AiEntity). */
export interface CallTypeRecordLike {
    transcription_id?: string | number | bigint | null;
    type?: string | null;
    result?: string | null;
    user_result?: unknown;
}

/** `callType` из JSON-результата записи; пусто — null. */
function callTypeOfUserResult(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null;
    const callType = (value as { callType?: unknown }).callType;
    return typeof callType === 'string' && callType.trim() ? callType : null;
}

/**
 * Тип звонка по ais-записям строки: итог глубокого разбора
 * (`agent-analysis`, тип уточнён синтезом) старше дешёвого классификатора
 * (`call-classify`). Записей ещё нет (разбор до классификации) — null:
 * тип неизвестен, раскладка ранжирует записи без него.
 */
export function callTypeOfRecords(
    records: readonly CallTypeRecordLike[],
    transcriptionId: string,
): string | null {
    const own = records.filter(
        record => String(record.transcription_id) === transcriptionId,
    );
    const analysis = own.find(record => record.type === AGENT_ANALYSIS_TYPE);
    const refined = callTypeOfUserResult(analysis?.user_result);
    if (refined) return refined;
    const classified = own.find(record => record.type === CALL_CLASSIFY_TYPE);
    return (
        classified?.result?.trim() ||
        callTypeOfUserResult(classified?.user_result)
    );
}
