import type { SiteLeadSubmitResult } from './site-lead.types';

/**
 * Бриф с сайта April: анкета (калибровка AI, оценка звонка), собранная в
 * текстовый протокол. Длинный — уходит в чат несколькими сообщениями.
 */

export const SITE_BRIEF_KINDS = ['calibration', 'call-review'] as const;
export type SiteBriefKind = (typeof SITE_BRIEF_KINDS)[number];

/** Начало темы сообщения по виду брифа. */
export const SITE_BRIEF_TITLES: Record<SiteBriefKind, string> = {
    calibration: 'Бриф калибровки',
    'call-review': 'Бриф оценки звонка',
};

export interface SiteBrief {
    kind: SiteBriefKind;
    company?: string;
    respondent?: string;
    /** Домен портала Битрикс24 из ответа анкеты. */
    domain?: string;
    /** Готовый текст протокола анкеты. */
    protocol: string;
    page?: string;
}

export const SITE_BRIEF_LIMITS = {
    /** Короткие поля: компания, кто заполнил, домен, страница. */
    field: 200,
    /** Протокол: бриф из ~50 ответов помещается с запасом. */
    protocol: 60_000,
} as const;

/**
 * Не больше сообщений на один бриф: у Telegram лимит около 20 сообщений в
 * минуту на группу, а чат общий с сигналами поддержки.
 */
export const SITE_BRIEF_MAX_PARTS = 10;

/**
 * Срок отправки брифа: новые части после него не начинаем. Сайт ждёт ответ
 * до 55 с (nginx по умолчанию рвёт ответ на 60 с) — бэк обязан уложиться
 * раньше, иначе посетитель увидит ошибку, а бриф дойдёт и задвоится при повторе.
 */
export const SITE_BRIEF_DEADLINE_MS = 45_000;

/** Пауза между частями брифа: Telegram просит не чаще раза в секунду на чат. */
export const SITE_BRIEF_PART_PAUSE_MS = 1100;

export interface SiteBriefSubmitResult {
    status: SiteLeadSubmitResult;
    /** Сколько частей принял Telegram. */
    parts: number;
}
