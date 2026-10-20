/**
 * Слабые разделы для правил «Внимания» этапа 2 (решение владельца
 * 19.10.2026): какие разделы и типы звонков считаются презентацией и
 * доработкой, ориентир отдела, условие «слабый раздел» и тексты опор.
 * Сами правила — attention.rules.quality.ts (лимит 300 строк на файл).
 *
 * Чистые функции.
 */
import type {
    CallReportCallTypeCode,
    CallReportSectionCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import type {
    AttentionBasis,
    AttentionManagerInput,
    AttentionRules,
    AttentionSectionMean,
} from './attention.types';
import { sectionTitleOf } from './dictionary-titles.util';
import { ruDecimal } from './ru-text.util';

/** Разделы, по которым судят о презентации и о доработке (коды рубрики). */
export const ATTENTION_PRESENTATION_SECTIONS = [
    'NEEDS',
    'PRESENTATION',
] as const satisfies readonly CallReportSectionCode[];
export const ATTENTION_FOLLOWUP_SECTIONS = [
    'OBJECTIONS',
    'CLOSING',
] as const satisfies readonly CallReportSectionCode[];

/** Типы звонков-презентаций и звонков доработки. */
export const ATTENTION_PRESENTATION_CALL_TYPES = [
    'presentation',
] as const satisfies readonly CallReportCallTypeCode[];
export const ATTENTION_FOLLOWUP_CALL_TYPES = [
    'refine',
    'decision',
] as const satisfies readonly CallReportCallTypeCode[];

export const isPresentationCallType = (callType: string | null): boolean =>
    callType !== null &&
    (ATTENTION_PRESENTATION_CALL_TYPES as readonly string[]).includes(callType);

export const isFollowupCallType = (callType: string | null): boolean =>
    callType !== null &&
    (ATTENTION_FOLLOWUP_CALL_TYPES as readonly string[]).includes(callType);

/** Коды опор карточек этапа 2. */
export const ATTENTION_QUALITY_BASIS_CODES = {
    NEEDS: 'needs_section_mean',
    PRESENTATION: 'presentation_section_mean',
    OBJECTIONS: 'objections_section_mean',
    CLOSING: 'closing_section_mean',
    objectionUnhandledShare: 'objection_unhandled_share',
    nextStepNoDateShare: 'next_step_no_date_share',
    lowScoreCalls: 'low_score_calls',
} as const;

const sectionBasisCode = (section: string): string =>
    (ATTENTION_QUALITY_BASIS_CODES as Readonly<Record<string, string>>)[
        section
    ] ?? `${section.toLowerCase()}_section_mean`;

/** Слабый раздел менеджера с ориентиром отдела (если он есть). */
export interface WeakSection {
    section: AttentionSectionMean;
    benchmark: AttentionSectionMean | null;
    /** Отставание от отдела в баллах; нет ориентира — null. */
    gap: number | null;
}

/**
 * Средние разделов по отделу: взвешенное по n среднее средних менеджеров
 * (презентации и доработка вместе — разделы у них разные). Пустой вход —
 * пусто.
 */
export function departmentSectionBenchmarks(
    managers: readonly AttentionManagerInput[],
): AttentionSectionMean[] {
    const acc = new Map<string, { sum: number; n: number }>();
    for (const manager of managers) {
        const sections = [
            ...(manager.presentation?.sections ?? []),
            ...(manager.followup?.sections ?? []),
        ];
        for (const section of sections) {
            const current = acc.get(section.section) ?? { sum: 0, n: 0 };
            current.sum += section.mean * section.n;
            current.n += section.n;
            acc.set(section.section, current);
        }
    }
    return [...acc.entries()]
        .filter(([, { n }]) => n > 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([section, { sum, n }]) => ({ section, mean: sum / n, n }));
}

/**
 * Слабые разделы: n раздела не меньше weakSectionMinN и (средняя не выше
 * weakSectionScoreMax ИЛИ ниже отдела на weakSectionGap и больше; ориентир
 * отдела учитывается только при его n не меньше weakSectionMinN).
 */
export function weakSectionsOf(
    sections: readonly AttentionSectionMean[],
    benchmarks: readonly AttentionSectionMean[] | undefined,
    allowed: readonly string[],
    rules: AttentionRules,
): WeakSection[] {
    return sections
        .filter(
            section =>
                allowed.includes(section.section) &&
                section.n >= rules.weakSectionMinN,
        )
        .flatMap(section => {
            const benchmark =
                benchmarks?.find(
                    item =>
                        item.section === section.section &&
                        item.n >= rules.weakSectionMinN,
                ) ?? null;
            const gap = benchmark ? benchmark.mean - section.mean : null;
            const weak =
                section.mean <= rules.weakSectionScoreMax ||
                (gap !== null && gap >= rules.weakSectionGap);
            return weak ? [{ section, benchmark, gap }] : [];
        })
        .sort((a, b) => a.section.mean - b.section.mean);
}

/** Сработало условие «ниже отдела на разрыв и больше». */
export const isBelowDepartment = (
    weak: WeakSection,
    rules: AttentionRules,
): boolean =>
    weak.benchmark !== null &&
    weak.gap !== null &&
    weak.gap >= rules.weakSectionGap;

/** «Выявление потребностей» 4,2 из 10 (у отдела 5,8) */
export function weakSectionText(
    weak: WeakSection,
    rules: AttentionRules,
): string {
    const base = `«${sectionTitleOf(weak.section.section)}» ${ruDecimal(weak.section.mean)} из 10`;
    return isBelowDepartment(weak, rules) && weak.benchmark
        ? `${base} (у отдела ${ruDecimal(weak.benchmark.mean)})`
        : base;
}

/** Опора: норма — средняя отдела, если сработал разрыв, иначе порог. */
export function weakSectionBasis(
    weak: WeakSection,
    rules: AttentionRules,
): AttentionBasis {
    return {
        code: sectionBasisCode(weak.section.section),
        value: weak.section.mean,
        norm:
            isBelowDepartment(weak, rules) && weak.benchmark
                ? weak.benchmark.mean
                : rules.weakSectionScoreMax,
        n: weak.section.n,
    };
}
