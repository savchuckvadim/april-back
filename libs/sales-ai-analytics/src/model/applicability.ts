import {
    CALL_REPORT_CALL_TYPE_CODES,
    CALL_REPORT_SECTION_CODES,
    CALL_REPORT_TYPE_PROFILES,
    CallReportCallTypeCode,
    CallReportSectionCode,
    CallReportTypeProfile,
} from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
// Guard типа звонка живёт в `buckets.ts` (Фаза 1b) и уже отдаётся наружу
// из barrel'а библиотеки — вторая копия здесь была бы дублем.
import { isCallTypeCode } from './buckets';

export { isCallTypeCode };

/**
 * Таблица применимости разделов рубрики к типам звонка (план §4.3).
 *
 * Таблица не настраивается и не хранится: она **выводится** из профилей типов
 * `CALL_REPORT_TYPE_PROFILES` (единый источник правды о смарте) по порогу
 * приора релевантности. Раздел применим к типу, если приор профиля не ниже
 * порога: «презентация» в холодном звонке (приор 20) неприменима, поэтому в
 * знаменатель оценок холодных звонков не входит и в «Как считаем» показана
 * как неприменимая.
 *
 * Профили читаются ТОЛЬКО на чтение: ни одно поле профиля здесь не меняется.
 */
export const APPLICABILITY_DEFAULTS = {
    /** Порог приора релевантности 0–100, с которого раздел применим. */
    minRelevance: 30,
} as const;

/** Клетка таблицы: тип звонка × раздел рубрики. */
export interface ApplicabilityCell {
    callType: CallReportCallTypeCode;
    section: CallReportSectionCode;
    /** Приор релевантности из профиля типа, 0–100. */
    relevance: number;
    applicable: boolean;
}

/** Таблица применимости с порогом, по которому она построена. */
export interface ApplicabilityTable {
    minRelevance: number;
    /** Клетки в порядке типов и разделов рубрики (детерминированно). */
    cells: readonly ApplicabilityCell[];
    /** Применимые разделы по типу звонка — быстрый доступ для сборки. */
    byType: Readonly<
        Record<CallReportCallTypeCode, readonly CallReportSectionCode[]>
    >;
}

type Profiles = Readonly<Record<CallReportCallTypeCode, CallReportTypeProfile>>;

const relevanceOf = (
    profiles: Profiles,
    callType: CallReportCallTypeCode,
    section: CallReportSectionCode,
): number => {
    const value = profiles[callType]?.sectionRelevance?.[section];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

const applicableFor = (
    cells: readonly ApplicabilityCell[],
    callType: CallReportCallTypeCode,
): readonly CallReportSectionCode[] =>
    cells
        .filter(cell => cell.callType === callType && cell.applicable)
        .map(cell => cell.section);

/**
 * Таблица применимости из профилей типов звонка. Порог по умолчанию 30:
 * ниже него приор профиля означает «раздел в этом типе звонка обычно не
 * встречается», и раздел не участвует ни в оценке, ни в счёте n_j.
 */
export function buildApplicability(
    profiles: Profiles = CALL_REPORT_TYPE_PROFILES,
    minRelevance: number = APPLICABILITY_DEFAULTS.minRelevance,
): ApplicabilityTable {
    const threshold = Number.isFinite(minRelevance)
        ? minRelevance
        : APPLICABILITY_DEFAULTS.minRelevance;
    const cells = CALL_REPORT_CALL_TYPE_CODES.flatMap(callType =>
        CALL_REPORT_SECTION_CODES.map(section => {
            const relevance = relevanceOf(profiles, callType, section);
            return {
                callType,
                section,
                relevance,
                applicable: relevance >= threshold,
            };
        }),
    );
    const of = (callType: CallReportCallTypeCode) =>
        applicableFor(cells, callType);
    return {
        minRelevance: threshold,
        cells,
        byType: {
            cold: of('cold'),
            site_lead: of('site_lead'),
            call: of('call'),
            presentation: of('presentation'),
            refine: of('refine'),
            decision: of('decision'),
            payment: of('payment'),
            other: of('other'),
            irrelevant: of('irrelevant'),
        },
    };
}

/**
 * Применим ли раздел к типу звонка. Неизвестный тип (звонок без AI-типа) —
 * применимы все разделы: гейт применимости не должен молча вычёркивать
 * данные, для которых тип ещё не определён.
 */
export function isSectionApplicable(
    table: ApplicabilityTable,
    callType: string | null | undefined,
    section: string,
): boolean {
    if (!isCallTypeCode(callType)) {
        return true;
    }
    return (table.byType[callType] as readonly string[]).includes(section);
}

/** Применимые разделы типа звонка; неизвестный тип — вся рубрика. */
export function applicableSections(
    table: ApplicabilityTable,
    callType: string | null | undefined,
): readonly CallReportSectionCode[] {
    return isCallTypeCode(callType)
        ? table.byType[callType]
        : CALL_REPORT_SECTION_CODES;
}

/** Сколько разделов применимо к типу звонка (знаменатель «Как считаем»). */
export function countApplicableSections(
    table: ApplicabilityTable,
    callType: string | null | undefined,
): number {
    return applicableSections(table, callType).length;
}

/**
 * Отбор разделов разбора по применимости: раздел с нулевой (ниже порога)
 * применимостью в счёт n_j не идёт, даже если оценка у него есть.
 */
export function filterApplicableSections<
    T extends { section: string; relevance: number },
>(
    sections: readonly T[],
    callType: string | null | undefined,
    table: ApplicabilityTable,
): T[] {
    return sections.filter(
        section =>
            section.relevance > 0 &&
            isSectionApplicable(table, callType, section.section),
    );
}
