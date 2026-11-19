/**
 * Личный ключ руководителя к странице разбора звонка: чистые функции без DI.
 *
 * Обычная ссылка `/call/<ключ звонка>` открывает разбор любому, у кого она
 * есть. Личный ключ добавляет к ней право оставить отзыв: адрес
 * `/call/<ключ звонка>/lead/<личный ключ>`. Ключ — `<нагрузка>.<подпись>`
 * (обе части base64url): кто (портал, пользователь, роль), к какому звонку
 * и до какого момента. Подпись — HMAC-SHA256 с ОТДЕЛЬНЫМ назначением
 * ключа: подпись ссылки звонка сюда не подходит, и наоборот.
 *
 * Это не JWT и не сессия портала: ключ годится только для страницы своего
 * звонка, а право на отзыв сервер перепроверяет при каждом сохранении.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Назначение ключа подписи: секрет приложения напрямую в подпись не идёт. */
const CALL_PAGE_LEAD_KEY_PURPOSE = 'april:call-page-lead:v1';

/** Версия формы нагрузки. */
const CALL_PAGE_LEAD_VERSION = 1;

/** Срок личного ключа — 7 дней (решение владельца 18.11.2026). */
export const CALL_PAGE_LEAD_TTL_SEC = 7 * 24 * 60 * 60;

/** Кто выпустил ключ: руководитель по структуре или суперпользователь. */
export const CALL_PAGE_LEAD_ROLES = ['leader', 'superuser'] as const;
export type CallPageLeadRole = (typeof CALL_PAGE_LEAD_ROLES)[number];

/** Нагрузка личного ключа (короткие имена — ключ едет в адресе). */
export interface CallPageLeadPayload {
    v: typeof CALL_PAGE_LEAD_VERSION;
    /** Домен портала. */
    d: string;
    /** Bitrix-id пользователя. */
    u: string;
    r: CallPageLeadRole;
    /** Номер расшифровки звонка. */
    t: string;
    /** Срок действия, unix-секунды. */
    e: number;
}

/** Данные для выпуска ключа. */
export interface CallPageLeadGrant {
    domain: string;
    userId: string;
    role: CallPageLeadRole;
    transcriptionId: string;
}

/** Итог проверки ключа: подделка/чужой формат, просрочен или годен. */
export type CallPageLeadCheck =
    | { status: 'invalid' }
    | { status: 'expired'; payload: CallPageLeadPayload }
    | { status: 'ok'; payload: CallPageLeadPayload };

const TOKEN_PATTERN = /^([A-Za-z0-9_-]{8,512})\.([A-Za-z0-9_-]{43})$/;
const ID_PATTERN = /^[1-9]\d{0,17}$/;

function signatureOf(secret: string, encodedPayload: string): Buffer {
    const key = createHmac('sha256', secret)
        .update(CALL_PAGE_LEAD_KEY_PURPOSE)
        .digest();
    return createHmac('sha256', key).update(encodedPayload).digest();
}

/** Нагрузка ключа из гранта: срок — 7 дней от `nowSec`. */
export function callPageLeadPayloadOf(
    grant: CallPageLeadGrant,
    nowSec: number,
): CallPageLeadPayload {
    return {
        v: CALL_PAGE_LEAD_VERSION,
        d: grant.domain,
        u: grant.userId,
        r: grant.role,
        t: grant.transcriptionId,
        e: Math.floor(nowSec) + CALL_PAGE_LEAD_TTL_SEC,
    };
}

/** Личный ключ `<нагрузка base64url>.<подпись base64url>`. */
export function buildCallPageLeadToken(
    secret: string,
    payload: CallPageLeadPayload,
): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = signatureOf(secret, encoded).toString('base64url');
    return `${encoded}.${signature}`;
}

const isLeadRole = (value: unknown): value is CallPageLeadRole =>
    typeof value === 'string' &&
    (CALL_PAGE_LEAD_ROLES as readonly string[]).includes(value);

/** Нагрузка из JSON; чужая форма — null. */
function parsePayload(encoded: string): CallPageLeadPayload | null {
    let raw: unknown;
    try {
        raw = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch {
        return null;
    }
    if (typeof raw !== 'object' || raw === null) return null;
    const value = raw as Record<string, unknown>;
    const valid =
        value.v === CALL_PAGE_LEAD_VERSION &&
        typeof value.d === 'string' &&
        value.d !== '' &&
        typeof value.u === 'string' &&
        ID_PATTERN.test(value.u) &&
        isLeadRole(value.r) &&
        typeof value.t === 'string' &&
        ID_PATTERN.test(value.t) &&
        typeof value.e === 'number' &&
        Number.isInteger(value.e);
    return valid
        ? {
              v: CALL_PAGE_LEAD_VERSION,
              d: value.d as string,
              u: value.u as string,
              r: value.r as CallPageLeadRole,
              t: value.t as string,
              e: value.e as number,
          }
        : null;
}

/**
 * Проверка ключа: формат, подпись (сравнение за постоянное время), форма
 * нагрузки и срок. Подпись проверяется ДО срока: подделка с прошедшей
 * датой отвечает «недействительна», а не «истекла».
 */
export function verifyCallPageLeadToken(
    secret: string,
    token: string,
    nowSec: number,
): CallPageLeadCheck {
    const match = TOKEN_PATTERN.exec(token.trim());
    if (!match) return { status: 'invalid' };
    const [, encoded, signature] = match;
    const expected = signatureOf(secret, encoded);
    const given = Buffer.from(signature, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        return { status: 'invalid' };
    }
    const payload = parsePayload(encoded);
    if (payload === null) return { status: 'invalid' };
    return payload.e <= nowSec
        ? { status: 'expired', payload }
        : { status: 'ok', payload };
}

/** Путь личной страницы разбора на сайте «Отчёта». */
export const callPageLeadPath = (
    callToken: string,
    leadToken: string,
): string => `/call/${callToken}/lead/${leadToken}`;

/** Полный адрес личной страницы: адрес сайта без хвостового «/» + путь. */
export function callPageLeadUrl(
    siteUrl: string,
    callToken: string,
    leadToken: string,
): string {
    return `${siteUrl.trim().replace(/\/+$/, '')}${callPageLeadPath(callToken, leadToken)}`;
}
