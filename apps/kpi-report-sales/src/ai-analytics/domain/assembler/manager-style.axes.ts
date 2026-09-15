/**
 * Маркеры осей стиля из разбора звонка и жёстких счётчиков телефонии
 * (документ `ai/tasks/ai-analytics-manager-style.md`, §2.1).
 *
 * Правило файла: ОДНА ось — ОДИН маркер с единой шкалой. Смешивать в оси
 * маркеры разных шкал нельзя: σ_w раздувается, а контраст к норме
 * коллег начинает зависеть от того, у кого больше разборов с полем.
 * Поэтому ось молчит, пока её маркера в строке нет, — «данных пока мало»
 * честнее подписи из половины наблюдений.
 *
 * Чистые функции: без DI, Bitrix и `new Date()`.
 */
import { CallReportCallTypeCode } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import type { StyleAxisCode, StyleRow } from '@lib/sales-ai-analytics';
import type { DatedLiteRow } from '../loaders/lite-row.mapper';
import type { StyleCrmManagerMonth } from '../loaders/style-crm.types';

/** Разделы рубрики, из контраста которых собирается ось `inquiry`. */
export const STYLE_INQUIRY_SECTIONS = {
    plus: 'NEEDS',
    minus: 'PRESENTATION',
} as const;

/**
 * Поздние стадии воронки по типу звонка — маркер оси `funnel_focus`
 * (доля касаний на поздних стадиях, §2.1 ось 3). Коды типов — из
 * справочника portal-lib, строковых литералов здесь нет.
 */
export const STYLE_LATE_STAGE_CALL_TYPES = [
    'presentation',
    'refine',
    'decision',
    'payment',
] as const satisfies readonly CallReportCallTypeCode[];

/** Ранние касания: первый контакт и назначение встречи. */
export const STYLE_EARLY_STAGE_CALL_TYPES = [
    'cold',
    'site_lead',
    'call',
] as const satisfies readonly CallReportCallTypeCode[];

/** Оценка раздела разбора (relevance > 0 и score задан); иначе null. */
export function sectionScore(row: DatedLiteRow, code: string): number | null {
    const section = row.sections.find(item => item.section === code);
    return section && section.relevance > 0 && section.score !== null
        ? section.score
        : null;
}

/**
 * Ось 2 «идёт от презентации ↔ исследует»: контраст оценок разделов
 * «Выявление потребностей» и «Презентация» одного разбора.
 *
 * Строгий маркер §2.1 (`needsFound`, `pitchBeforeNeeds`) приедет вместе с
 * test-retest S3: смена маркера рвёт ряд (`markerSetSignature`), поэтому
 * делается отдельным шагом, а не молча.
 */
export function inquiryOf(row: DatedLiteRow): number | null {
    const plus = sectionScore(row, STYLE_INQUIRY_SECTIONS.plus);
    const minus = sectionScore(row, STYLE_INQUIRY_SECTIONS.minus);
    return plus !== null && minus !== null ? plus - minus : null;
}

/**
 * Ось 1 «даёт говорить ↔ задаёт ход»: доля речи менеджера, %.
 * Во внутреннем конвейере это ОЦЕНКА LLM по тексту без разметки ролей
 * (диаризации нет) — доверие оси понижено на уровне карточки.
 */
export function initiativeOf(row: DatedLiteRow): number | null {
    return row.style?.talkRatioPct ?? null;
}

/** Ось 6 «цена после ценности ↔ цена сразу»: прозвучала ли цена (0/1). */
export function pricePositionOf(row: DatedLiteRow): number | null {
    const discussed = row.style?.priceDiscussed;
    return discussed === null || discussed === undefined
        ? null
        : Number(discussed);
}

/**
 * Ось 3 «набирает встречи ↔ доводит до оплаты»: касание на поздней
 * стадии (1) против ранней (0). Типы вне обоих списков (`other`,
 * `irrelevant`, неизвестный) единицей наблюдения не являются.
 */
export function funnelFocusOf(row: DatedLiteRow): number | null {
    const callType = row.callType as CallReportCallTypeCode | null;
    if (callType === null) return null;
    if ((STYLE_LATE_STAGE_CALL_TYPES as readonly string[]).includes(callType)) {
        return 1;
    }
    return (STYLE_EARLY_STAGE_CALL_TYPES as readonly string[]).includes(
        callType,
    )
        ? 0
        : null;
}

/**
 * Единицы осей одного разбора: ось попадает в строку, только если её
 * маркер в разборе есть. Добавление оси — одна строка в этой карте.
 */
export function axesOf(
    row: DatedLiteRow,
): Partial<Record<StyleAxisCode, number>> {
    const markers: Record<string, number | null> = {
        inquiry: inquiryOf(row),
        initiative: initiativeOf(row),
        price_position: pricePositionOf(row),
        funnel_focus: funnelFocusOf(row),
    };
    const axes: Partial<Record<StyleAxisCode, number>> = {};
    for (const [axis, value] of Object.entries(markers)) {
        if (value !== null) axes[axis as StyleAxisCode] = value;
    }
    return axes;
}

/**
 * Строки жёстких осей из счётчиков телефонии (§2.1 оси 4, 7, 8). Единицы
 * разные — лид, рабочий день — поэтому каждая единица идёт своей строкой
 * и в чужую ось не подмешивается.
 */
export function crmStyleRows(
    counters: readonly StyleCrmManagerMonth[],
): StyleRow[] {
    return counters.flatMap(manager => [
        ...manager.units.attemptsPerLead.map(value => ({
            managerId: manager.managerId,
            axes: { persistence: value },
        })),
        ...manager.units.callsPerWorkday.map(value => ({
            managerId: manager.managerId,
            axes: { tempo: value },
        })),
        ...manager.units.rhythmPerWorkday.map(value => ({
            managerId: manager.managerId,
            axes: { rhythm: value },
        })),
    ]);
}
