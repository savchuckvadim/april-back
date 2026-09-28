/**
 * Строки `basis` рычагов словами — их читает руководитель в подсказке
 * рекомендации, поэтому здесь нет кодов, формул и обозначений (правило
 * владельца): «ещё 12 звонков», «примерно 1 продажа на 43 звонка»,
 * «поднять оценку раздела «работа по цене» с 6,4 до 7,4».
 *
 * Вынесено из `recommend.ts` по лимиту 300 строк; чистые функции.
 */
import { objectionTitleOf } from './dictionary-titles.util';
import { sectionTitle } from './explanation-template';
import type {
    ChecklistLeverInput,
    ObjectionLeverInput,
    PipelineLeverInput,
    QualityLeverInput,
    VolumeLeverInput,
} from './lever.types';
import {
    RU_FORMS,
    callTypeCountForms,
    ruAmount,
    ruCount,
    ruDecimal,
    ruInt,
} from './ru-text.util';

/**
 * Подписи пунктов чек-листа: коды рычагов чек-листа задаёт вызывающая
 * сторона, здесь — известные пункты витрины; чужой код остаётся как есть.
 */
const CHECKLIST_TITLES: Readonly<Record<string, string>> = {
    'next-step': 'Шаг с датой',
    next_step: 'Шаг с датой',
    NEXT_STEP: 'Шаг с датой',
    next_step_date: 'Шаг с датой',
    hvost: '«Хвост»',
    five_k: '«5К»',
};

const checklistTitle = (code: string): string => CHECKLIST_TITLES[code] ?? code;

/** «оценку раздела «работа по цене»» либо «оценку», если раздел не задан. */
const qualityTarget = (section: string | undefined): string =>
    section === undefined
        ? 'оценку'
        : `оценку раздела «${sectionTitle(section)}»`;

/** Рычаг объёма: «ещё 12 звонков», «примерно 1 продажа на 43 звонка». */
export function volumeBasis(input: VolumeLeverInput): string[] {
    const forms = callTypeCountForms(input.callType);
    const perSale =
        input.salesPerUnit > 0
            ? `примерно 1 продажа на ${ruCount(Math.max(1, ruInt(1 / input.salesPerUnit)), forms)}`
            : 'продаж с этой активности пока не было';

    return [`ещё ${ruAmount(input.addedUnits, forms)}`, perSale];
}

/** Рычаг качества: «поднять оценку раздела … с 6,4 до 7,4», «по 24 разборам». */
export function qualityBasis(input: QualityLeverInput): string[] {
    return [
        `поднять ${qualityTarget(input.section)} ` +
            `с ${ruDecimal(input.score)} до ${ruDecimal(input.score + input.delta)}`,
        `по ${ruCount(input.sectionCalls, RU_FORMS.reviewsDative)}`,
    ];
}

/** Рычаг чек-листа: «с «Шагом с датой» до продажи дошли 12 из 30, без него — 5 из 28». */
export function checklistBasis(
    item: ChecklistLeverInput,
    chainLinked: boolean,
): string[] {
    return [
        `с «${checklistTitle(item.code)}» до продажи дошли ` +
            `${item.withItem.s} из ${item.withItem.n}, без него — ` +
            `${item.withoutItem.s} из ${item.withoutItem.n}`,
        chainLinked
            ? 'звонки связаны со сделками'
            : 'звонки ещё не связаны со сделками',
    ];
}

/** Рычаг сделок в работе: «сделок в работе: 12». */
export function pipelineBasis(input: PipelineLeverInput): string[] {
    return [`сделок в работе: ${input.openDeals}`];
}

/** Рычаг возражений: «Цена: исход взят из сделки в CRM», «отработано 3 из 10». */
export function objectionBasis(item: ObjectionLeverInput): string[] {
    return [
        `${objectionTitleOf(item.category)}: исход взят из сделки в CRM`,
        `отработано ${item.crm.handled.s} из ${item.crm.handled.n}`,
    ];
}
