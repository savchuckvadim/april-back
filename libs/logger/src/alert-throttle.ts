/**
 * Ограничитель повторных оповещений: одно сообщение на ключ за окно.
 *
 * ЗАЧЕМ. Точечная отправка в Telegram (`{ telegram: true }`) пробивает
 * общий уровень транспорта, а сбои внешних сервисов повторяются на каждом
 * звонке конвейера. Без ограничителя одна поломка провайдера превращается
 * в поток одинаковых сообщений: чат становится нечитаемым, и настоящую
 * аварию в нём уже не заметить.
 *
 * ЧЕМ ОТЛИЧАЕТСЯ ОТ ЛИМИТА ТРАНСПОРТА. `TelegramTransport` режет общий
 * поток сообщений в минуту — это защита канала. Здесь другое: свой счётчик
 * на КАЖДУЮ причину, чтобы редкое важное сообщение не вытеснялось частым
 * шумом и наоборот.
 *
 * Время приходит параметром — класс детерминирован и проверяется тестами
 * без подмены системных часов.
 */

/** Окно по умолчанию: одно оповещение на ключ в полчаса. */
export const ALERT_THROTTLE_WINDOW_MS = 30 * 60 * 1000;

/** Сколько ключей помним; выше — самые старые вычищаются. */
const MAX_KEYS = 500;

export class AlertThrottle {
    private readonly sentAt = new Map<string, number>();

    /**
     * @param windowMs окно между оповещениями по одному ключу
     */
    constructor(private readonly windowMs: number = ALERT_THROTTLE_WINDOW_MS) {}

    /**
     * Пропускать ли оповещение по ключу.
     *
     * Первый вызов по ключу — всегда `true`; следующие — только когда окно
     * истекло. Вызов с `true` считается отправкой и сдвигает окно.
     */
    allow(key: string, now: number): boolean {
        const last = this.sentAt.get(key);
        if (last !== undefined && now - last < this.windowMs) {
            return false;
        }
        this.evictExpired(now);
        this.sentAt.set(key, now);
        return true;
    }

    /** Сколько ключей под наблюдением (для тестов и диагностики). */
    size(): number {
        return this.sentAt.size;
    }

    /** Забыть ключ — например, когда сервис снова отвечает. */
    reset(key: string): void {
        this.sentAt.delete(key);
    }

    /**
     * Чистка протухших ключей. Нужна не ради памяти как таковой, а чтобы
     * долгоживущий процесс не копил ключи с динамическими частями
     * (домен портала, код ошибки) без ограничения.
     */
    private evictExpired(now: number): void {
        for (const [key, at] of this.sentAt) {
            if (now - at >= this.windowMs) this.sentAt.delete(key);
        }
        if (this.sentAt.size < MAX_KEYS) return;
        const oldest = [...this.sentAt.entries()].sort((a, b) => a[1] - b[1]);
        for (const [key] of oldest.slice(0, this.sentAt.size - MAX_KEYS + 1)) {
            this.sentAt.delete(key);
        }
    }
}
