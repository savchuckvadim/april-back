/**
 * Действующие и отменённые риск-флаги разбора звонка (решения владельца
 * 19–20.10.2026, этап 2 плана ai/tasks/2026-10-19-ai-focus-plan.md):
 * сигналом руководителю считается только ДЕЙСТВУЮЩИЙ флаг с
 * доказательством-цитатой. Отменённые коды (обещание клиенту, негатив
 * клиента) в расчёты сигналов не входят даже в старых данных, флаги без
 * цитаты — тоже. Одно правило для «Внимания», пульса, повестки и
 * вспомогательных фактов конвейера.
 *
 * Чистые функции над константами `pbx-aicall-smart`.
 */
import {
    CALL_REPORT_ACTIVE_RISK_FLAG_CODES,
    CALL_REPORT_RETIRED_RISK_FLAG_CODES,
    type CallReportActiveRiskFlagCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import { nonEmptyText } from './sections.util';

/** Доказательство флага в объёме, который нужен сигналам: код и цитата. */
export interface RiskEvidenceLike {
    flag: string;
    quote: string | null;
}

/** Действующий флаг с его дословной цитатой. */
export interface ProvenRiskFlag {
    flag: CallReportActiveRiskFlagCode;
    quote: string;
}

/** Код — действующий риск-флаг (conflict, compliance, door_closed). */
export function isActiveRiskFlag(
    code: unknown,
): code is CallReportActiveRiskFlagCode {
    return (
        typeof code === 'string' &&
        (CALL_REPORT_ACTIVE_RISK_FLAG_CODES as readonly string[]).includes(code)
    );
}

/** Код — отменённый риск-флаг (promise, client_negative). */
export function isRetiredRiskFlag(code: unknown): boolean {
    return (
        typeof code === 'string' &&
        (CALL_REPORT_RETIRED_RISK_FLAG_CODES as readonly string[]).includes(
            code,
        )
    );
}

/**
 * Действующие флаги звонка, у которых есть доказательство с непустой
 * цитатой: по одному на флаг (первая цитата), в порядке справочника
 * действующих флагов. Флаг без цитаты и отменённый флаг — не сигнал;
 * доказательств нет вовсе (старый разбор) — пусто.
 */
export function provenRiskFlags(
    flags: readonly string[] | null | undefined,
    evidence: readonly RiskEvidenceLike[] | null | undefined,
): ProvenRiskFlag[] {
    const present = new Set((flags ?? []).filter(isActiveRiskFlag));
    if (present.size === 0) return [];
    const quotes = new Map<CallReportActiveRiskFlagCode, string>();
    for (const item of evidence ?? []) {
        const quote = nonEmptyText(item.quote);
        if (
            quote !== null &&
            isActiveRiskFlag(item.flag) &&
            present.has(item.flag) &&
            !quotes.has(item.flag)
        ) {
            quotes.set(item.flag, quote);
        }
    }
    return CALL_REPORT_ACTIVE_RISK_FLAG_CODES.flatMap(flag => {
        const quote = quotes.get(flag);
        return quote === undefined ? [] : [{ flag, quote }];
    });
}

/** Коды действующих доказанных флагов звонка (см. provenRiskFlags). */
export const provenRiskFlagCodes = (
    flags: readonly string[] | null | undefined,
    evidence: readonly RiskEvidenceLike[] | null | undefined,
): CallReportActiveRiskFlagCode[] =>
    provenRiskFlags(flags, evidence).map(item => item.flag);
