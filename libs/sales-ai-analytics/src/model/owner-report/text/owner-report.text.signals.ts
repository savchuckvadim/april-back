import {
    OWNER_REPORT_QUALITY_LINK_STEP_POINTS,
    type OwnerReportQualityLink,
} from '../owner-report.quality-link';
import type { OwnerReportReactivationFacts } from '../owner-report.types';
import { countText, pctText, REPORT_FORMS } from './owner-report.format';
import type { OwnerReportQualityLinkText } from './owner-report.text.types';

/**
 * Сигналы из CRM словами: связь качества показа и продаж (предварительная
 * оценка с диапазоном вместо «связь не задана» — решение владельца
 * 09.11.2026) и источники отказа у возвратов для раздела «Как считали».
 */

type Forms = Parameters<typeof countText>[1];

const PRESENTATIONS_DATIVE: Forms = ['показу', 'показам', 'показам'];
const PRESENTATIONS_GENITIVE: Forms = ['показа', 'показов', 'показов'];
const MANAGERS_GENITIVE: Forms = ['сотрудника', 'сотрудников', 'сотрудников'];
const MONTHS_GENITIVE: Forms = ['месяца', 'месяцев', 'месяцев'];

const NO_DATA_LINE =
    'Связь качества показа и продаж пока не оценена: данных о показах с известным исходом ещё нет. Уточняется ежемесячно.';

/** Вероятность (0–1) процентом без десятых: 0,404 → «40 %». */
const probabilityText = (p: number): string => pctText(Math.round(p * 100));

/** Балл качества: целые без «,0», иначе одна десятая через запятую. */
const scoreText = (score: number): string =>
    Number.isInteger(score)
        ? String(score)
        : score.toFixed(1).replace('.', ',');

function noEstimateLine(link: OwnerReportQualityLink): string {
    const left =
        link.presentationsLeft !== null && link.presentationsLeft > 0
            ? `, до первой оценки нужно ещё ≈ ${countText(link.presentationsLeft, PRESENTATIONS_GENITIVE)}` +
              (link.monthsLeft !== null && link.monthsLeft > 0
                  ? ` (около ${countText(Math.ceil(link.monthsLeft), MONTHS_GENITIVE)} при текущем темпе)`
                  : '')
            : '';
    return `Связь качества показа и продаж пока не оценена: показов с известным исходом — ${link.presentations}${left}. Уточняется ежемесячно.`;
}

/** Связь качества показа и продаж словами; без снапшота — «данных ещё нет». */
export function buildQualityLinkText(
    link: OwnerReportQualityLink | null,
): OwnerReportQualityLinkText {
    if (!link) return { status: 'none', lines: [NO_DATA_LINE] };
    if (
        link.status === 'none' ||
        link.sRef === null ||
        link.pRef === null ||
        link.plusStep === null
    ) {
        return { status: 'none', lines: [noEstimateLine(link)] };
    }
    const { p, low, high } = link.plusStep;
    const sample = `${countText(link.presentations, PRESENTATIONS_DATIVE)} у ${countText(link.managers, MANAGERS_GENITIVE)}`;
    const base =
        `при качестве показа ${scoreText(link.sRef)} из 10 счёт или КП следуют в ${probabilityText(link.pRef)} случаев, ` +
        `при качестве на ${OWNER_REPORT_QUALITY_LINK_STEP_POINTS} балла выше — `;
    if (link.status === 'confirmed') {
        return {
            status: 'confirmed',
            lines: [
                `По данным портала (${sample}): ${base}${probabilityText(p)} (от ${probabilityText(low)} до ${probabilityText(high)}).`,
            ],
        };
    }
    const left =
        link.presentationsLeft !== null && link.presentationsLeft > 0
            ? `; до устойчивой оценки нужно ещё ≈ ${countText(link.presentationsLeft, PRESENTATIONS_GENITIVE)}`
            : '';
    return {
        status: 'preliminary',
        lines: [
            `Предварительная оценка по ${sample} (уточняется ежемесячно): ${base}около ${probabilityText(p)}.`,
            `Разброс пока широкий: от ${probabilityText(low)} до ${probabilityText(high)}${left}.`,
        ],
    };
}

/**
 * Строка «Как считали» об источниках отказа у возвратов; null — возвратов
 * в периоде нет. Записи «ОП История» и поля сделки — вторичные источники.
 */
export function reactivationSourcesNote(
    reactivation: OwnerReportReactivationFacts,
): string | null {
    if (reactivation.calls === 0) return null;
    const { stage, history, fields } = reactivation.bySource;
    const head = `Возвратов ушедших и отказавших — ${countText(reactivation.calls, REPORT_FORMS.calls)}`;
    if (history === 0 && fields === 0) {
        return `${head}, все по финалам сделок «ОП Основная»; записи «ОП История» типа «Отказ» и поля сделки дополнительных не дали.`;
    }
    return (
        `${head}: отказ виден по финалу сделки «ОП Основная» у ${stage}, по записи «ОП История» типа «Отказ» — у ${history}, ` +
        `по полям сделки («Нет перспектив», «ОП Причина Отказа», «Не интересует») — у ${fields}. ` +
        'Записи и поля менеджеров — вторичный источник и могут быть неполными, поэтому учитываются осторожно и считаются отдельно.'
    );
}
