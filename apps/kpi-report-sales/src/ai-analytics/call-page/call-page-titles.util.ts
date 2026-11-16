/**
 * Подписи кодов разбора для страницы звонка. Коды людям не показываем:
 * кода нет в справочнике — подписи нет (null), строка на странице не
 * появляется. Справочники — те же, что у карточки разбора в Битриксе.
 */
import {
    CALL_REPORT_COACHING_ITEMS,
    CALL_REPORT_COMPETITOR_ITEMS,
    CALL_REPORT_INTERLOCUTOR_ITEMS,
    CALL_REPORT_ISSUE_ITEMS,
    CALL_REPORT_NEXT_STEP_KIND_ITEMS,
    CALL_REPORT_OBJECTION_REACTION_TITLES,
    CALL_REPORT_OBJECTION_REACTIONS,
    CALL_REPORT_OUTCOME_ITEMS,
    CALL_REPORT_REFUSAL_ITEMS,
    CALL_REPORT_SENTIMENT_ITEMS,
    CALL_REPORT_SPECIALIST_ITEMS,
    CALL_REPORT_UPSELL_ITEMS,
    type CallReportObjectionReaction,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';

interface CodeItem {
    CODE: string;
    VALUE: string;
}

const titles = (items: readonly CodeItem[]): ReadonlyMap<string, string> =>
    new Map(items.map(item => [item.CODE, item.VALUE]));

const DICTIONARIES = {
    outcome: titles(CALL_REPORT_OUTCOME_ITEMS),
    nextStepKind: titles(CALL_REPORT_NEXT_STEP_KIND_ITEMS),
    issue: titles(CALL_REPORT_ISSUE_ITEMS),
    upsell: titles(CALL_REPORT_UPSELL_ITEMS),
    interlocutor: titles(CALL_REPORT_INTERLOCUTOR_ITEMS),
    specialist: titles(CALL_REPORT_SPECIALIST_ITEMS),
    competitor: titles(CALL_REPORT_COMPETITOR_ITEMS),
    sentiment: titles(CALL_REPORT_SENTIMENT_ITEMS),
    coaching: titles(CALL_REPORT_COACHING_ITEMS),
    refusal: titles(CALL_REPORT_REFUSAL_ITEMS),
} as const;

export type CallPageDictionary = keyof typeof DICTIONARIES;

/** Подпись кода из справочника; нет кода или подписи — null. */
export function callPageTitleOf(
    dictionary: CallPageDictionary,
    code: string | null,
): string | null {
    return code === null ? null : (DICTIONARIES[dictionary].get(code) ?? null);
}

/** Подписи кодов списком; коды без подписи пропускаются. */
export function callPageTitlesOf(
    dictionary: CallPageDictionary,
    codes: readonly string[],
): string[] {
    return codes
        .map(code => callPageTitleOf(dictionary, code))
        .filter((title): title is string => title !== null);
}

/** Чем закончилось возражение. */
const OBJECTION_OUTCOME_TITLES: Readonly<Record<string, string>> = {
    continued: 'разговор продолжился',
    converted: 'клиент согласился',
    disengaged: 'клиент ушёл из разговора',
};

export const objectionOutcomeTitleOf = (
    outcome: string | null,
): string | null =>
    outcome === null ? null : (OBJECTION_OUTCOME_TITLES[outcome] ?? null);

const isReaction = (value: string): value is CallReportObjectionReaction =>
    (CALL_REPORT_OBJECTION_REACTIONS as readonly string[]).includes(value);

/**
 * «Как отработал»: свободный текст разбора; если модель положила туда код
 * реакции — подпись вместо кода. Текста нет — подпись реакции.
 */
export function objectionHandlingOf(
    handling: string | null,
    reaction: string | null,
): string | null {
    const value = handling ?? reaction;
    if (value === null) return null;
    return isReaction(value)
        ? CALL_REPORT_OBJECTION_REACTION_TITLES[value]
        : value;
}

/** Чьи слова в цитате сигнала риска. */
const RISK_SPEAKER_TITLES: Readonly<Record<string, string>> = {
    manager: 'Слова менеджера',
    client: 'Слова клиента',
};

export const riskSpeakerTitleOf = (speaker: string | null): string | null =>
    speaker === null ? null : (RISK_SPEAKER_TITLES[speaker] ?? null);

/** «120 000 ₽». */
export const rubTitle = (amount: number): string =>
    `${Math.round(amount).toLocaleString('ru-RU')} ₽`;

/** Обрезка длинной подписи по слову, с многоточием. */
export function shortTitle(text: string, max = 80): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max);
    const space = cut.lastIndexOf(' ');
    return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
