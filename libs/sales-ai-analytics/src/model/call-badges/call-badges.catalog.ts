/**
 * Бейджи списка разобранных звонков: справочник (код, подпись, подсказка,
 * тон, семейство) и соответствия бейджей кодам разбора. Каким звонкам какой
 * бейдж достаётся, решает чистая функция call-badges.evaluate; здесь — только
 * справочные данные.
 *
 * Тексты — для людей, без внутренних кодов: подпись до 28 знаков (плашка в
 * строке звонка), подсказка — одно предложение о том, что бейдж значит.
 */
import type {
    CallReportOutcomeCode,
    CallReportSectionCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import type { CallBadgeDef } from './call-badges.types';

export * from './call-badges.types';

/** Общие поля семи бейджей «слабо: раздел»: отличаются только код и подпись. */
const WEAK_SECTION_BASE = {
    hint: 'Раздел разговора оценён на 5 из 10 или ниже.',
    tone: 'warn',
    family: null,
    main: false,
    problem: false,
    since: null,
} as const;

export const CALL_BADGES = [
    {
        id: 'step_missing',
        title: 'Шаг не назначен',
        hint: 'Следующий шаг с клиентом в разговоре не назначен.',
        tone: 'bad',
        family: null,
        main: true,
        problem: true,
        since: null,
    },
    {
        id: 'step_no_date',
        title: 'Шаг без даты',
        hint: 'Следующий шаг назначен, но дата не названа.',
        tone: 'warn',
        family: null,
        main: false,
        problem: true,
        since: null,
    },
    {
        id: 'objection_unhandled',
        title: 'Возражение без ответа',
        hint: 'Есть возражение клиента, которое менеджер не отработал.',
        tone: 'warn',
        family: null,
        main: true,
        problem: true,
        since: null,
    },
    {
        id: 'signal',
        title: 'Сигнал руководителю',
        hint: 'Разбор нашёл ошибку менеджера: конфликт, нарушение регламента, неотработанное возражение или показ без потребностей.',
        tone: 'bad',
        family: null,
        main: true,
        problem: true,
        since: null,
    },
    {
        id: 'outcome_advanced',
        title: 'Итог: продвинулся',
        hint: 'Итог разговора: показ, доступ, предложение или счёт.',
        tone: 'good',
        family: 'outcome',
        main: false,
        problem: false,
        since: '2026-11-06',
    },
    {
        id: 'outcome_callback',
        title: 'Итог: перезвон с датой',
        hint: 'Итог разговора: договорились созвониться в названный день.',
        tone: 'neutral',
        family: 'outcome',
        main: false,
        problem: false,
        since: '2026-11-06',
    },
    {
        id: 'outcome_postponed',
        title: 'Итог: отложено',
        hint: 'Итог разговора: отложено без даты.',
        tone: 'warn',
        family: 'outcome',
        main: false,
        problem: false,
        since: '2026-11-06',
    },
    {
        id: 'outcome_refused',
        title: 'Итог: отказ',
        hint: 'Итог разговора: клиент отказался.',
        tone: 'bad',
        family: 'outcome',
        main: true,
        problem: false,
        since: '2026-11-06',
    },
    {
        id: 'outcome_no_contact',
        title: 'Итог: нет контакта',
        hint: 'Содержательного разговора не получилось.',
        tone: 'neutral',
        family: 'outcome',
        main: false,
        problem: false,
        since: '2026-11-06',
    },
    {
        id: 'progress_low',
        title: 'Сделка не продвинулась',
        hint: 'Продвижение сделки по звонку — 1 или 2 из 5.',
        tone: 'bad',
        family: null,
        main: true,
        problem: true,
        since: '2026-11-01',
    },
    {
        id: 'capped',
        title: 'Оценка срезана',
        hint: 'Оценку раздела или итог срезал ограничитель.',
        tone: 'warn',
        family: null,
        main: false,
        problem: false,
        since: '2026-11-01',
    },
    {
        id: 'price_named',
        title: 'Цена прозвучала',
        hint: 'В разговоре названа цена.',
        tone: 'neutral',
        family: null,
        main: false,
        problem: false,
        since: null,
    },
    {
        id: 'upsell_tried',
        title: 'Была допродажа',
        hint: 'Менеджер пробовал предложить больше.',
        tone: 'good',
        family: null,
        main: false,
        problem: false,
        since: '2026-11-06',
    },
    {
        id: 'not_lpr',
        title: 'Говорил не с ЛПР',
        hint: 'Собеседник не тот, кто принимает решение.',
        tone: 'neutral',
        family: null,
        main: false,
        problem: false,
        since: null,
    },
    {
        id: 'no_self_intro',
        title: 'Не представился',
        hint: 'Менеджер не назвал себя в начале разговора.',
        tone: 'warn',
        family: null,
        main: false,
        problem: true,
        since: '2026-11-06',
    },
    {
        id: 'issue',
        title: 'Сбой не по вине разговора',
        hint: 'Дубль в CRM, не тот номер и другие сбои, не зависящие от разговора.',
        tone: 'neutral',
        family: null,
        main: false,
        problem: false,
        since: '2026-11-06',
    },
    {
        id: 'needs_missing',
        title: 'Потребности не выявлены',
        hint: 'Менеджер не выяснил потребности клиента.',
        tone: 'warn',
        family: null,
        main: false,
        problem: true,
        since: null,
    },
    { id: 'weak_greeting', title: 'Слабо: приветствие', ...WEAK_SECTION_BASE },
    { id: 'weak_needs', title: 'Слабо: потребности', ...WEAK_SECTION_BASE },
    {
        id: 'weak_presentation',
        title: 'Слабо: презентация',
        ...WEAK_SECTION_BASE,
    },
    { id: 'weak_objections', title: 'Слабо: возражения', ...WEAK_SECTION_BASE },
    { id: 'weak_price', title: 'Слабо: цена', ...WEAK_SECTION_BASE },
    { id: 'weak_closing', title: 'Слабо: закрытие', ...WEAK_SECTION_BASE },
    { id: 'weak_refusal', title: 'Слабо: отказ', ...WEAK_SECTION_BASE },
] as const satisfies readonly CallBadgeDef[];

export type CallBadgeId = (typeof CALL_BADGES)[number]['id'];
/** Бейджи «слабо: раздел». */
export type CallBadgeWeakId = Extract<CallBadgeId, `weak_${string}`>;
/** Бейджи итога разговора. */
export type CallBadgeOutcomeId = Extract<CallBadgeId, `outcome_${string}`>;

/** Коды бейджей в порядке справочника. */
export const CALL_BADGE_IDS: readonly CallBadgeId[] = CALL_BADGES.map(
    badge => badge.id,
);

export const isCallBadgeId = (value: string): value is CallBadgeId =>
    (CALL_BADGE_IDS as readonly string[]).includes(value);

const CALL_BADGE_BY_ID: ReadonlyMap<string, CallBadgeDef> = new Map(
    CALL_BADGES.map((badge): [string, CallBadgeDef] => [badge.id, badge]),
);

/** Описание бейджа из справочника. */
export function callBadgeDef(id: CallBadgeId): CallBadgeDef {
    const def = CALL_BADGE_BY_ID.get(id);
    if (!def) throw new Error(`Бейдж звонка не найден в справочнике: ${id}`);
    return def;
}

/** Бейдж «слабо: раздел» → код раздела. */
export const CALL_BADGE_WEAK_SECTIONS: Readonly<
    Record<CallBadgeWeakId, CallReportSectionCode>
> = {
    weak_greeting: 'GREETING',
    weak_needs: 'NEEDS',
    weak_presentation: 'PRESENTATION',
    weak_objections: 'OBJECTIONS',
    weak_price: 'PRICE',
    weak_closing: 'CLOSING',
    weak_refusal: 'REFUSAL',
};

/** Бейдж итога → код итога разговора. */
export const CALL_BADGE_OUTCOMES: Readonly<
    Record<CallBadgeOutcomeId, CallReportOutcomeCode>
> = {
    outcome_advanced: 'advanced',
    outcome_callback: 'callback_dated',
    outcome_postponed: 'postponed',
    outcome_refused: 'refused',
    outcome_no_contact: 'no_contact',
};
