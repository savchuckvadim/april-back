import { Logger } from '@nestjs/common';
import {
    CALL_REPORT_RISK_FLAG_CODES,
    CallReportRiskFlagCode,
    isTimecodeWithinDuration,
} from '@lib/call-lib';
import {
    AgentCallAnalysisDto,
    AgentRiskEvidenceDto,
} from '../dto/agent-analysis-request.dto';

/**
 * Риск-флаги при приёме разбора (решение владельца 19.10.2026): флаг
 * без доказательства с непустой цитатой снимается, дубли схлопываются,
 * доказательства чужих или снятых флагов отбрасываются. Чистые функции.
 */

const isKnownFlag = (value: unknown): value is CallReportRiskFlagCode =>
    typeof value === 'string' &&
    (CALL_REPORT_RISK_FLAG_CODES as readonly string[]).includes(value);

/** Доказательство засчитывается: известный код и непустая цитата. */
function isProven(item: AgentRiskEvidenceDto): boolean {
    return isKnownFlag(item.flag) && Boolean(item.quote?.trim());
}

/**
 * Сверка riskFlags с riskEvidence: остаются только флаги, у которых есть
 * доказательство с цитатой; снятые и повторы считаются в лог. Разбор без
 * обоих полей не трогается (старый контракт без флагов).
 */
export function reconcileRiskFlags(
    transcriptionId: string,
    dto: AgentCallAnalysisDto,
    logger: Logger,
): AgentCallAnalysisDto {
    if (dto.riskFlags === undefined && dto.riskEvidence === undefined) {
        return dto;
    }
    const evidence = (dto.riskEvidence ?? []).filter(isProven);
    const proven = new Set(evidence.map(item => item.flag));
    const unique = Array.from(new Set(dto.riskFlags ?? []));
    const duplicates = (dto.riskFlags?.length ?? 0) - unique.length;
    const kept = unique.filter(flag => proven.has(flag));
    const dropped = unique.filter(flag => !proven.has(flag));
    const keptSet = new Set(kept);
    const seen = new Set<string>();
    const keptEvidence = evidence.filter(item => {
        const key = `${item.flag}|${item.quote.trim()}`;
        if (!keptSet.has(item.flag) || seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    if (dropped.length) {
        logger.warn(
            `Риск-флаги без доказательства сняты (${dropped.length}): ` +
                `${dropped.join(', ')} (transcription ${transcriptionId})`,
        );
    }
    if (duplicates > 0) {
        logger.log(
            `Повторы риск-флагов схлопнуты: ${duplicates} (transcription ${transcriptionId})`,
        );
    }
    const orphan = evidence.length - keptEvidence.length;
    if (orphan > 0) {
        logger.log(
            `Доказательства без флага или повторные отброшены: ${orphan} (transcription ${transcriptionId})`,
        );
    }

    return { ...dto, riskFlags: kept, riskEvidence: keptEvidence };
}

/** Пара таймкодов лежит внутри записи и не перевёрнута. */
export function isTimecodeRangeValid(
    start: number | null | undefined,
    end: number | null | undefined,
    durationSec: number | null,
): boolean {
    const from = start ?? null;
    const to = end ?? null;
    const startOk =
        from === null || isTimecodeWithinDuration(from, durationSec);
    const endOk =
        to === null ||
        (isTimecodeWithinDuration(to, durationSec) &&
            (from === null || to >= from));
    return startOk && endOk;
}

/**
 * Таймкоды доказательств сверяются с длительностью записи — как у
 * возражений (clampObjectionTimecodes): секунда вне записи обнуляется с
 * предупреждением, цитата остаётся. Длительность неизвестна — проверять
 * нечем.
 */
export function clampRiskEvidenceTimecodes(
    transcriptionId: string,
    dto: AgentCallAnalysisDto,
    durationSec: number | null,
    logger: Logger,
): AgentCallAnalysisDto {
    if (!dto.riskEvidence?.length) return dto;
    let dropped = 0;
    const riskEvidence = dto.riskEvidence.map(item => {
        if (isTimecodeRangeValid(item.startSec, item.endSec, durationSec)) {
            return item;
        }
        dropped += 1;
        return { ...item, startSec: null, endSec: null };
    });
    if (dropped > 0) {
        logger.warn(
            `Таймкоды ${dropped} доказательств риск-флагов вне записи ` +
                `(${durationSec ?? '?'} с) обнулены (transcription ${transcriptionId})`,
        );
    }
    return { ...dto, riskEvidence };
}
