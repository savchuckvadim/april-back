/**
 * Короткая память раскладки семьи сделок на время разбора одного звонка.
 *
 * ЗАЧЕМ. После включения шага 0 («ОП История» как источник истины, §4
 * прод-фиксов) каждый вызов `CallReportDealFamilyService.resolve` читает
 * элементы двух списков отчётности. За один разбор звонка раскладка
 * запрашивается трижды — из сборщика контекста, из создания карточки
 * разбора и из приёма анализа, — то есть портал получал шесть лишних
 * обращений на звонок, всегда с одним и тем же ответом.
 *
 * Здесь ответ переиспользуется в пределах короткого окна. Ключ включает
 * портал и все входы раскладки: разные звонки и разные порталы никогда не
 * делят запись. Окно намеренно маленькое — связи меняются в CRM, и ночная
 * ревизия обязана видеть свежую разметку, а не вчерашнюю.
 *
 * Время приходит параметром: класс детерминирован и проверяется без
 * подмены системных часов.
 */

/** Окно памяти: разбор одного звонка укладывается в него с запасом. */
export const FAMILY_CACHE_TTL_MS = 60_000;

/** Сколько ключей помним; выше — самые старые вычищаются. */
const MAX_KEYS = 500;

interface Entry<T> {
    value: T;
    at: number;
}

export class CallReportFamilyCache<T> {
    private readonly entries = new Map<string, Entry<T>>();

    constructor(private readonly ttlMs: number = FAMILY_CACHE_TTL_MS) {}

    /** Ответ по ключу, если он ещё свежий; иначе undefined. */
    get(key: string, now: number): T | undefined {
        const entry = this.entries.get(key);
        if (entry === undefined) return undefined;
        if (now - entry.at >= this.ttlMs) {
            this.entries.delete(key);
            return undefined;
        }
        return entry.value;
    }

    /** Запомнить ответ. */
    set(key: string, value: T, now: number): void {
        this.evictExpired(now);
        this.entries.set(key, { value, at: now });
    }

    /** Сколько ключей под наблюдением (для тестов и диагностики). */
    size(): number {
        return this.entries.size;
    }

    /** Забыть всё — например, когда связи правят вручную. */
    clear(): void {
        this.entries.clear();
    }

    private evictExpired(now: number): void {
        for (const [key, entry] of this.entries) {
            if (now - entry.at >= this.ttlMs) this.entries.delete(key);
        }
        if (this.entries.size < MAX_KEYS) return;
        const oldest = [...this.entries.entries()].sort(
            (a, b) => a[1].at - b[1].at,
        );
        for (const [key] of oldest.slice(0, this.entries.size - MAX_KEYS + 1)) {
            this.entries.delete(key);
        }
    }
}

/** Значения ключа: всё, от чего зависит раскладка. */
export interface FamilyCacheKeyInput {
    domain: string;
    dealId?: number;
    leadId?: number;
    companyId?: number;
    contactId?: number;
    callStartedAt?: Date | string | null;
    /** Номер приходит из телефонии и бывает числом. */
    callerId?: string | number | null;
    callType?: string | null;
}

/** Ключ памяти: портал плюс все входы раскладки, в фиксированном порядке. */
export function familyCacheKey(input: FamilyCacheKeyInput): string {
    const startedAt =
        input.callStartedAt instanceof Date
            ? input.callStartedAt.toISOString()
            : (input.callStartedAt ?? '');
    return [
        input.domain,
        input.dealId ?? '',
        input.leadId ?? '',
        input.companyId ?? '',
        input.contactId ?? '',
        startedAt,
        input.callerId ?? '',
        input.callType ?? '',
    ].join('|');
}
