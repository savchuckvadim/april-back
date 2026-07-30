/**
 * Детерминированные идентификаторы очереди эфирного времени.
 *
 * jobId — ключ ДЕДУПЛИКАЦИИ Bull: повторный клик/второй пользователь с тем же
 * периодом не создаёт второй прогон, а «подписывается» на уже идущий job
 * (removeOnComplete освобождает id после завершения). Домен — обязательная
 * часть id: изоляция порталов-клиентов.
 *
 * requestKey — эхо запроса для матчинга на фронте: слайс отбрасывает WS-события
 * и поллинг-ответы, не совпадающие с последним отправленным ключом (паттерн
 * finance: `${from}|${to}|${sortedIds}`). Домена не содержит — фронт строит
 * такой же ключ локально.
 */
import type { IsoDate, IsoMonth } from '../../shared/lib/month-segments.util';
import { AIRTIME_PARTITION_VERSION } from '../constants/airtime-queue.const';

export const buildAirtimeMonthJobId = (
    domain: string,
    month: IsoMonth,
): string => `airtime:v${AIRTIME_PARTITION_VERSION}:${domain}:m:${month}`;

export const buildAirtimeDaySpanJobId = (
    domain: string,
    from: IsoDate,
    to: IsoDate,
): string => `airtime:v${AIRTIME_PARTITION_VERSION}:${domain}:d:${from}:${to}`;

/** Нормализованные userId: числовые, уникальные, по возрастанию. */
export const normalizeAirtimeUserIds = (userIds: readonly number[]): number[] =>
    [...new Set(userIds)].sort((a, b) => a - b);

export const buildAirtimeRequestKey = (
    from: IsoDate,
    to: IsoDate,
    userIds: readonly number[],
): string => `${from}|${to}|${normalizeAirtimeUserIds(userIds).join('_')}`;
