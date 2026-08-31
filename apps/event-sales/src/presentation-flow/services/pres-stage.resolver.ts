import {
    PRESENTATION_OPEN_STAGE_CODES,
    PresentationSmartInfo,
    PresentationSmartStageCode,
} from '@lib/portal-lib/pbx/pbx-presentation-smart';
import {
    PresentationOutcome,
    presentationStageForOutcome,
} from '../lib/presentation-outcome';

/**
 * ВСЁ ПРО СТАДИИ элемента презентации — в одном месте (зеркало
 * zpr-stage.resolver).
 *
 * Ремонтируешь «не в ту стадию уехала» / «не считается открытой» — идти
 * сюда; САМО правило «исход отчёта → код стадии» продуктовое и живёт в
 * lib/presentation-outcome (presentationStageForOutcome), здесь только
 * стадийная адресация портала.
 */

/**
 * Полный stageId стадии по её коду; `undefined` — стадии нет на портале.
 * Функция, а не индексация: при `noImplicitAny: false` опечатка в коде
 * молча давала бы `any` — см. развёрнутое «почему» у zprStageId.
 */
export function presStageId(
    info: PresentationSmartInfo,
    code: PresentationSmartStageCode,
): string | undefined {
    return info.stageIdByCode[code];
}

/**
 * Стадии, в которых элемент считается ОТКРЫТЫМ. Берутся из константы
 * смарта, а не перечисляются здесь: с приходом контура согласования их
 * стало четыре (заявка, на согласовании, план, перенос), и забытая стадия
 * означала бы, что отчёт по ждущей согласования заявке заводит спонтанный
 * дубль.
 */
export function presOpenStageIds(info: PresentationSmartInfo): string[] {
    return PRESENTATION_OPEN_STAGE_CODES.map(code =>
        presStageId(info, code),
    ).filter((stageId): stageId is string => Boolean(stageId));
}

/**
 * stageId для исхода отчёта; `undefined` — стадии нет на портале (смарт
 * установлен не полностью): вызывающий пишет отчёт без смены стадии, а не
 * теряет его целиком.
 */
export function presStageForOutcome(
    info: PresentationSmartInfo,
    outcome: PresentationOutcome,
    isResult: boolean,
): string | undefined {
    return presStageId(info, presentationStageForOutcome(outcome, isResult));
}
