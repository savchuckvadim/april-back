/**
 * Ссылка-пропуск на страницу разбора звонка: чистые функции без DI.
 *
 * Ссылка открывается без входа, поэтому в ней подпись, которую нельзя
 * подобрать: `<номер расшифровки в base36>-<подпись>`. Таблицы ссылок в базе
 * нет: подпись считается из номера расшифровки и метки звонка. Метка по
 * умолчанию пустая; отзыв ссылки — запись `call-page-link` в `ais` с новой
 * меткой, после неё прежняя подпись перестаёт сходиться.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Тип записи `ais` с меткой ссылки звонка (появляется при отзыве). */
export const CALL_PAGE_LINK_TYPE = 'call-page-link' as const;

/** Назначение ключа: секрет приложения напрямую в подпись не идёт. */
const CALL_PAGE_KEY_PURPOSE = 'april:call-page-link:v1';

/** Длина подписи в байтах: 24 байта — 32 знака в ссылке. */
const SIGNATURE_BYTES = 24;

const TOKEN_PATTERN = /^([0-9a-z]{1,13})-([A-Za-z0-9_-]{32})$/;

/** Запись `ais` в объёме, нужном метке ссылки. */
export interface CallPageLinkRecordView {
    id: string;
    type?: string | null;
    user_result?: unknown;
}

export interface CallPageTokenParts {
    transcriptionId: string;
    signature: string;
}

/**
 * Секрет подписи из окружения: общий секрет входа, иначе секрет приложения.
 * Не задан ни один — null: ссылки не выпускаются и не открываются (подпись
 * на известном всем значении ничего бы не защищала).
 */
export function callPageSecretOf(
    env: Readonly<Record<string, string | undefined>>,
): string | null {
    const secret = env.AUTH_JWT_SECRET?.trim() || env.APP_SECRET_KEY?.trim();
    return secret ? secret : null;
}

function signatureOf(
    secret: string,
    transcriptionId: string,
    mark: string,
): Buffer {
    const key = createHmac('sha256', secret)
        .update(CALL_PAGE_KEY_PURPOSE)
        .digest();
    return createHmac('sha256', key)
        .update(`${transcriptionId}:${mark}`)
        .digest()
        .subarray(0, SIGNATURE_BYTES);
}

/** Номер расшифровки (десятичная строка) → base36; не число — null. */
function encodeId(transcriptionId: string): string | null {
    if (!/^[1-9]\d{0,17}$/.test(transcriptionId)) return null;
    return BigInt(transcriptionId).toString(36);
}

function decodeId(encoded: string): string {
    let value = 0n;
    for (const char of encoded) {
        value = value * 36n + BigInt(parseInt(char, 36));
    }
    return value.toString(10);
}

/** Ссылка-пропуск звонка; номер расшифровки не число — null. */
export function buildCallPageToken(
    secret: string,
    transcriptionId: string,
    mark: string,
): string | null {
    const encoded = encodeId(transcriptionId);
    if (encoded === null) return null;
    const signature = signatureOf(secret, transcriptionId, mark);
    return `${encoded}-${signature.toString('base64url')}`;
}

/** Разбор ссылки-пропуска; чужой формат — null (в базу не ходим). */
export function parseCallPageToken(token: string): CallPageTokenParts | null {
    const match = TOKEN_PATTERN.exec(token.trim());
    if (!match) return null;
    const transcriptionId = decodeId(match[1]);
    return transcriptionId === '0'
        ? null
        : { transcriptionId, signature: match[2] };
}

/** Сходится ли подпись ссылки с меткой звонка (сравнение за постоянное время). */
export function isCallPageTokenValid(
    secret: string,
    parts: CallPageTokenParts,
    mark: string,
): boolean {
    const expected = signatureOf(secret, parts.transcriptionId, mark);
    const given = Buffer.from(parts.signature, 'base64url');
    return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Метка из нагрузки записи отзыва; чужая форма — null. */
function markOfPayload(payload: unknown): string | null {
    if (typeof payload !== 'object' || payload === null) return null;
    const mark = (payload as Record<string, unknown>).mark;
    return typeof mark === 'string' && mark !== '' ? mark : null;
}

/**
 * Действующая метка звонка: из самой новой записи отзыва (id записи растёт);
 * отзывов не было — пустая строка.
 */
export function callPageMarkOf(
    records: readonly CallPageLinkRecordView[],
): string {
    let newest: { id: number; mark: string } | null = null;
    for (const record of records) {
        if (record.type !== CALL_PAGE_LINK_TYPE) continue;
        const mark = markOfPayload(record.user_result);
        const id = Number(record.id);
        if (mark === null || !Number.isFinite(id)) continue;
        if (newest === null || id > newest.id) newest = { id, mark };
    }
    return newest?.mark ?? '';
}

/** Путь страницы разбора на сайте «Отчёта». */
export const callPagePath = (token: string): string => `/call/${token}`;

/** Полный адрес страницы разбора: адрес сайта без хвостового «/» + путь. */
export function callPageUrl(siteUrl: string, token: string): string {
    return `${siteUrl.trim().replace(/\/+$/, '')}${callPagePath(token)}`;
}
