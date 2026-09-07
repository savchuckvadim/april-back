import {
    CALL_REPORT_SECTION_CODES,
    CallReportSectionCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import { AnalysisSection } from './sections.util';

/**
 * Форма vs содержание (план §4.3).
 *
 * «Форма» — то, чем менеджер управляет сам: он открывает разговор, задаёт
 * вопросы и закрывает на следующий шаг независимо от реакции клиента.
 * «Содержание/реакция» — разделы, которые появляются только когда клиент
 * возразил, спросил цену или отказал: они частично отражают исход, поэтому
 * предиктор модели «качество → исход» (§4.4) строится ТОЛЬКО по форме.
 * PRESENTATION смешан (сценарий менеджера + запрос клиента) и не входит ни
 * в предиктор, ни в содержание — kind 'mixed'.
 */
export const QUALITY_FORM_SECTIONS = [
    'GREETING',
    'NEEDS',
    'CLOSING',
] as const satisfies readonly CallReportSectionCode[];

export const QUALITY_CONTENT_SECTIONS = [
    'OBJECTIONS',
    'PRICE',
    'REFUSAL',
] as const satisfies readonly CallReportSectionCode[];

export type QualityFormSection = (typeof QUALITY_FORM_SECTIONS)[number];
export type QualityContentSection = (typeof QUALITY_CONTENT_SECTIONS)[number];

/** Форма / содержание / смешанный раздел. */
export type QualitySectionKind = 'form' | 'content' | 'mixed';

/**
 * Полная разметка рубрики (exhaustive по CALL_REPORT_SECTION_CODES —
 * новый раздел рубрики не скомпилируется без явного вида).
 */
export const QUALITY_SECTION_KIND: Record<
    CallReportSectionCode,
    QualitySectionKind
> = {
    GREETING: 'form',
    NEEDS: 'form',
    PRESENTATION: 'mixed',
    OBJECTIONS: 'content',
    PRICE: 'content',
    CLOSING: 'form',
    REFUSAL: 'content',
};

/**
 * Признаки формы вне рубрики (считаются по полям разбора, а не по разделам):
 * число вопросов, доля речи менеджера и назначенный следующий шаг.
 */
export const QUALITY_FORM_FEATURES = [
    'questionsCount',
    'talkRatioPct',
    'nextStepSet',
] as const;

export type QualityFormFeature = (typeof QUALITY_FORM_FEATURES)[number];

/** Раздел относится к «форме» (управляет менеджер). */
export const isFormSection = (section: string): section is QualityFormSection =>
    (QUALITY_FORM_SECTIONS as readonly string[]).includes(section);

/** Раздел относится к «содержанию/реакции» (частично исход). */
export const isContentSection = (
    section: string,
): section is QualityContentSection =>
    (QUALITY_CONTENT_SECTIONS as readonly string[]).includes(section);

/** Вид раздела; неизвестный код рубрики считаем смешанным. */
export const sectionKind = (section: string): QualitySectionKind =>
    (CALL_REPORT_SECTION_CODES as readonly string[]).includes(section)
        ? QUALITY_SECTION_KIND[section as CallReportSectionCode]
        : 'mixed';

/** Средневзвешенная по relevance оценка выбранных разделов; null — весов нет. */
function weightedSectionScore(
    sections: readonly AnalysisSection[],
    include: (section: string) => boolean,
): number | null {
    let weight = 0;
    let weighted = 0;
    for (const section of sections) {
        if (
            !include(section.section) ||
            section.score === null ||
            !(section.relevance > 0)
        ) {
            continue;
        }
        weight += section.relevance;
        weighted += section.relevance * section.score;
    }
    return weight > 0 ? weighted / weight : null;
}

/**
 * S^form звонка — средневзвешенная по relevance оценка ТОЛЬКО разделов формы
 * (GREETING, NEEDS, CLOSING). Это предиктор модели «качество → исход»
 * следующих волн (§4.4); OBJECTIONS, PRICE, REFUSAL и PRESENTATION в него не
 * входят. null — ни одного раздела формы с relevance > 0 и оценкой.
 */
export const formScore = (
    sections: readonly AnalysisSection[],
): number | null => weightedSectionScore(sections, isFormSection);

/**
 * S^content звонка — те же правила по разделам содержания/реакции.
 * В описательных карточках показывается рядом с формой, в модель не входит.
 */
export const contentScore = (
    sections: readonly AnalysisSection[],
): number | null => weightedSectionScore(sections, isContentSection);
