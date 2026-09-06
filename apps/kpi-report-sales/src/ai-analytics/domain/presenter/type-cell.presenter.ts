/**
 * Ячейка матрицы → AiManagerTypeCellDto: подпись типа, разделы с
 * объяснением по шаблону, чек-листы, KPI-часть, объяснение оценки через
 * renderCellExplanation (@lib/sales-ai-analytics). Чистые функции.
 */
import {
    AI_ANALYTICS_EVENT_KINDS,
    CALL_REPORT_CALL_TYPE_CODES,
    CALL_REPORT_SECTIONS,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import {
    bucketOfCallType,
    buildCellCore,
    compareCallTypes,
    isCallTypeCode,
    MatrixCellCore,
    MatrixSectionAggregate,
    MetricValue,
    renderCellExplanation,
    sectionTitle,
} from '@lib/sales-ai-analytics';
import {
    AiCellSectionDto,
    AiManagerTypeCellDto,
    AiSectionExplanationDto,
} from '../../dto/ai-manager-type-cell.dto';
import type { CellKpiPart } from '../assembler/manager-facts.assembler';

const SECTION_TITLES: ReadonlyMap<string, string> = new Map(
    CALL_REPORT_SECTIONS.map(section => [section.code, section.title]),
);

/** 6.4 → «6,4» (текст) и «6.4» (basis). */
export const ru1 = (value: number): string =>
    value.toFixed(1).replace('.', ',');
export const en1 = (value: number): string => value.toFixed(1);

/** Подпись типа из карты алфавитов; неизвестный код — как есть. */
export function typeTitle(callType: string): string {
    return isCallTypeCode(callType)
        ? AI_ANALYTICS_EVENT_KINDS[callType].title
        : callType;
}

/** Подпись раздела рубрики с большой буквы; неизвестный код — как есть. */
export function sectionTitleOf(code: string): string {
    return SECTION_TITLES.get(code) ?? code;
}

/** Типы справочника плюс встреченные вне его, в детерминированном порядке. */
export function orderedCallTypes(extra: Iterable<string>): string[] {
    return [
        ...new Set<string>([...CALL_REPORT_CALL_TYPE_CODES, ...extra]),
    ].sort(compareCallTypes);
}

/** Нижняя медиана; пусто → null. */
export function median(values: readonly number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor((sorted.length - 1) / 2)];
}

/**
 * Объяснение раздела по шаблону: «Раздел «работа по цене»: 4,2/10 (n = 11,
 * применимость 72 %).»; при n < 8 — «мало данных (n = …)». Каждое число
 * продублировано в basis. Опорных звонков на раздел в Фазе 1b нет.
 */
export function renderSectionExplanation(
    section: MatrixSectionAggregate,
): AiSectionExplanationDto {
    if (section.avgScore === null) {
        return {
            text: `мало данных (n = ${section.n})`,
            basis: [`n=${section.n}`],
            evidenceCallIds: [],
        };
    }
    const relevance = Math.round(section.avgRelevance);
    return {
        text: `Раздел «${sectionTitle(section.section)}»: ${ru1(section.avgScore)}/10 (n = ${section.n}, применимость ${relevance} %).`,
        basis: [
            `section=${section.section}:${en1(section.avgScore)}:n=${section.n}`,
            `relevance=${relevance}`,
        ],
        evidenceCallIds: [],
    };
}

export function toSectionDto(
    section: MatrixSectionAggregate,
): AiCellSectionDto {
    return {
        section: section.section,
        title: sectionTitleOf(section.section),
        avgScore: section.avgScore,
        n: section.n,
        avgRelevance: section.avgRelevance,
        explanation: renderSectionExplanation(section),
    };
}

/** Пустое ядро ячейки (тип без звонков в периоде). */
export const emptyCellCore = (): MatrixCellCore => buildCellCore([], 0);

export interface CellContext {
    /** Медиана оценок команды по типу (шкала 1–10); null — не показывать. */
    teamMedian: number | null;
    /** Доля отработанных возражений, % — только для ячейки refine. */
    handledRatePct?: MetricValue | null;
}

export function toCellDto(
    callType: string,
    core: MatrixCellCore,
    kpi: CellKpiPart,
    context: CellContext,
): AiManagerTypeCellDto {
    const explanation = renderCellExplanation(core, {
        teamMedian: context.teamMedian,
    });
    return {
        callType,
        title: typeTitle(callType),
        bucket: bucketOfCallType(callType),
        n: core.n,
        nBeforeComparable: core.nBeforeComparable,
        versionsMixed: core.versionsMixed,
        score: core.score,
        sections: core.sections.map(toSectionDto),
        checklists: {
            ...core.checklists,
            ...(context.handledRatePct
                ? { handledRatePct: context.handledRatePct }
                : {}),
        },
        kpi: kpi.kpi,
        primaryKpi: kpi.primaryKpi,
        kpiReason: kpi.kpiReason,
        explanation: {
            source: 'template',
            text: explanation.text,
            basis: explanation.basis,
            evidenceCallIds: core.evidenceCallIds,
        },
    };
}
