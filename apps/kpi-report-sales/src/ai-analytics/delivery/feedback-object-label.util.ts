/**
 * Подпись объекта обратной связи словами для push-уведомлений и витрины:
 * код `object` ais-записи (`call:<id>`, `section:<code>`, `pulse`,
 * `agenda`, `overview:<id>`, `attention:<id>:<signal>`, `site-review:<id>`,
 * `style:tag:<code>`, `lever:<id>:<ключ совета>`) руководитель видеть не
 * должен — только «по звонку», «по разделу «Работа по цене»», «по совету
 * «Объём»» и т.п. Чистая функция без Nest и Bitrix.
 */
import {
    type AiLever,
    STYLE_TAGS,
    parseLeverKey,
    sectionTitleOf,
} from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_FEEDBACK_OBJECTS } from '../constants/ai-analytics.const';
import { AI_REVIEW_FEEDBACK_OBJECT_PREFIX } from '../constants/ai-review.const';
import { parseLeverFeedbackObject } from '../domain/use-cases/feedback-lever.util';
import { STYLE_FEEDBACK_TAG_PREFIX } from '../style/style-dispute.util';

/** Префиксы объектов, у которых подпись не зависит от хвоста кода. */
const PREFIX_LABELS: readonly (readonly [prefix: string, label: string])[] = [
    [AI_ANALYTICS_FEEDBACK_OBJECTS.CALL_PREFIX, 'по звонку'],
    ['overview:', 'по строке обзора'],
    ['attention:', 'по сигналу «Внимания»'],
    [AI_REVIEW_FEEDBACK_OBJECT_PREFIX, 'отзыв с сайта по разбору'],
];

const SECTION_PREFIX = 'section:';

/**
 * Рычаг совета словами — те же подписи, что у колонки «Рычаги» витрины
 * (фронт, ai-signal.util AI_LEVER).
 */
export const AI_LEVER_TITLES = {
    volume: 'Объём',
    quality: 'Качество',
    checklist: 'Чек-лист',
    pipeline: 'Сделки',
    objection: 'Возражение',
} as const satisfies Record<AiLever, string>;

/** Подпись объекта без кода: неизвестная форма — обобщённое «по записи». */
export const FEEDBACK_OBJECT_FALLBACK_LABEL = 'по записи';

function sectionLabel(code: string): string {
    const title = sectionTitleOf(code);
    return title === code ? 'по разделу' : `по разделу «${title}»`;
}

function styleTagLabel(code: string): string {
    const title = STYLE_TAGS.find(tag => tag.code === code)?.title;
    return title === undefined
        ? 'по подписи стиля'
        : `по подписи стиля «${title}»`;
}

/**
 * Совет по объекту `lever:<id>:<ключ>`: рычаг из ключа (тот же разбор, что
 * у ручки feedback), битый объект — без названия.
 */
function leverLabel(object: string): string {
    const parsed = parseLeverFeedbackObject(object);
    const lever = parsed && parseLeverKey(parsed.key)?.lever;
    return !lever ? 'по совету' : `по совету «${AI_LEVER_TITLES[lever]}»`;
}

/** «по звонку», «по разделу «Работа по цене»», «по пульсу», … */
export function feedbackObjectLabel(object: string): string {
    if (object === AI_ANALYTICS_FEEDBACK_OBJECTS.PULSE) return 'по пульсу';
    if (object === AI_ANALYTICS_FEEDBACK_OBJECTS.AGENDA) return 'по повестке';
    if (object.startsWith(SECTION_PREFIX)) {
        return sectionLabel(object.slice(SECTION_PREFIX.length));
    }
    if (object.startsWith(AI_ANALYTICS_FEEDBACK_OBJECTS.LEVER_PREFIX)) {
        return leverLabel(object);
    }
    if (object.startsWith(STYLE_FEEDBACK_TAG_PREFIX)) {
        return styleTagLabel(object.slice(STYLE_FEEDBACK_TAG_PREFIX.length));
    }
    const known = PREFIX_LABELS.find(([prefix]) => object.startsWith(prefix));
    return known === undefined ? FEEDBACK_OBJECT_FALLBACK_LABEL : known[1];
}
