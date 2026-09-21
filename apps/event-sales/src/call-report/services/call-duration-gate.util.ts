import {
    minDurationSecOf,
    type MinDurationSecByType,
} from '@lib/sales-ai-analytics';
import type { CallClassificationResultDto } from '@lib/vibecode';
import type { CallReportPipelineResult } from '../use-cases/call-report-pipeline.use-case';
import type { EffectiveCallReportSettings } from './call-report-settings.service';

/**
 * Гейты стадии анализа ПОСЛЕ классификации (тип звонка известен): чистые
 * правила без DI, по которым конвейер останавливает разбор штатно — без
 * исключения, с флагом в результате и причиной в логе.
 *
 * 1. Нерелевантность: сотрудник сам звонил в стороннюю организацию /
 *    личный / ошибочный разговор — техника продаж не оценивается.
 * 2. Порог длительности ТИПА (решение владельца А.1: порог только
 *    отсекает, тип не назначает). Скан отбирает звонки по МИНИМУМУ карты
 *    порогов — тип там ещё неизвестен; окончательный отсев делается здесь:
 *    звонок короче порога СВОЕГО типа в дорогой разбор (GigaChat, глубокий
 *    разбор, смарт-элемент) не идёт. Классификация уже в ais — звонок виден
 *    в отчётах со своим типом.
 */

/** Код типа-гейта из конфига смарта: «не наш разговор». */
export const IRRELEVANT_CALL_TYPE = 'irrelevant';

/** Ответ классификатора в объёме, нужном гейтам. */
export type GateClassification = Pick<
    CallClassificationResultDto,
    'callType' | 'confidence' | 'reason'
>;

/** Настройки портала, которые читают гейты. */
export type GateSettings = Pick<
    EffectiveCallReportSettings,
    'irrelevantConfidence' | 'minDurationSecByType'
>;

export interface AnalysisStopInput {
    classification: GateClassification | null;
    /** Длительность звонка, с; null — неизвестна (гейт порога не применяется). */
    durationSec: number | null;
    settings: GateSettings;
}

/** Остановка разбора: флаг результата конвейера и причина для лога. */
export interface AnalysisStop {
    /** Флаг результата — тем же способом, что и прежний гейт нерелевантности. */
    result: Pick<CallReportPipelineResult, 'irrelevant' | 'shortCall'>;
    message: string;
}

/**
 * Длительность звонка на стадии анализа: из задачи (телефония, CALL_DURATION)
 * либо из строки конвейера (сохранена на стадии транскрибации). Ни того, ни
 * другого — null: судить не по чему, гейт порога не применяется (fail-open).
 */
export function callDurationSecOf(
    payloadSec: number | undefined,
    rowSec: string | number | null | undefined,
): number | null {
    for (const raw of [payloadSec, rowSec]) {
        if (raw === undefined || raw === null || raw === '') continue;
        const value = Number(raw);
        if (Number.isFinite(value) && value >= 0) return value;
    }
    return null;
}

/**
 * Уверенный `irrelevant` останавливает разбор. Ложное срабатывание чинится
 * порогом уверенности: сомнительные случаи идут полным путём.
 */
export function irrelevantStop(
    classification: GateClassification | null,
    confidenceThreshold: number,
): AnalysisStop | null {
    if (
        !classification ||
        classification.callType !== IRRELEVANT_CALL_TYPE ||
        classification.confidence < confidenceThreshold
    ) {
        return null;
    }
    return {
        result: { irrelevant: true },
        message:
            `Звонок нерелевантен (confidence ${classification.confidence}): ` +
            classification.reason,
    };
}

/**
 * Звонок короче порога своего типа (для звонка без типа — ключ `default`
 * карты). Карты нет или она пуста — порог неизвестен, гейт не применяется.
 */
export function shortCallStop(
    classification: GateClassification | null,
    durationSec: number | null,
    minDurationSecByType: MinDurationSecByType | undefined,
): AnalysisStop | null {
    if (
        durationSec === null ||
        !minDurationSecByType ||
        Object.keys(minDurationSecByType).length === 0
    ) {
        return null;
    }
    const callType = classification?.callType ?? null;
    const minDurationSec = minDurationSecOf(callType, minDurationSecByType);
    if (durationSec >= minDurationSec) return null;
    return {
        result: { shortCall: true },
        message:
            `Звонок короче порога типа ${callType ?? 'без типа'}: ` +
            `${durationSec} с < ${minDurationSec} с`,
    };
}

/** Первый сработавший гейт: нерелевантность старше порога длительности. */
export function resolveAnalysisStop(
    input: AnalysisStopInput,
): AnalysisStop | null {
    return (
        irrelevantStop(
            input.classification,
            input.settings.irrelevantConfidence,
        ) ??
        shortCallStop(
            input.classification,
            input.durationSec,
            input.settings.minDurationSecByType,
        )
    );
}
