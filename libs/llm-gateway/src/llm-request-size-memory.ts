/** Сколько помнить размер, на котором поставщик ответил «запрос слишком большой». */
export const LLM_TOO_LARGE_MEMORY_MS = 60 * 60_000;

interface RememberedSize {
    /** Наименьший размер запроса, получивший 413, знаков. */
    chars: number;
    /** Когда запись перестаёт действовать, мс. */
    until: number;
}

/**
 * Память «запрос такого размера поставщик не принимает» (16.11.2026).
 *
 * Бесплатный Groq отвечает 413 на разборы длинных звонков: запрос больше его
 * минутного лимита токенов и не пройдёт, сколько ни повторяй. Каждый такой
 * отказ стоил лишнего обращения и попадал в тревогу как «поставщик не
 * ответил». Теперь размер, на котором пришёл 413, запоминается на час по
 * ключу «адрес + модель + ключ доступа» (у своего ключа портала другой
 * тариф, чем у общего): запросы того же размера и больше к поставщику не
 * уходят. Через час запись гаснет — тариф могли поднять, пробуем снова.
 *
 * Память процесса: настройка не нужна, после перезапуска первый большой
 * запрос один раз получит 413 и запомнится заново.
 */
export class LlmRequestSizeMemory {
    private readonly byKey = new Map<string, RememberedSize>();

    /** Поставщик отказал запросу такого размера — запомнить наименьший. */
    remember(key: string, chars: number, now: number): void {
        const known = this.active(key, now);
        this.byKey.set(key, {
            chars: known ? Math.min(known.chars, chars) : chars,
            until: now + LLM_TOO_LARGE_MEMORY_MS,
        });
    }

    /** Не меньше ли запрос того, на котором поставщик уже отказал. */
    blocks(key: string, chars: number, now: number): boolean {
        const known = this.active(key, now);
        return known !== null && chars >= known.chars;
    }

    private active(key: string, now: number): RememberedSize | null {
        const known = this.byKey.get(key);
        if (!known) return null;
        if (now >= known.until) {
            this.byKey.delete(key);
            return null;
        }
        return known;
    }
}
