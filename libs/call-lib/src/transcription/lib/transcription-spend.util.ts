/**
 * Расход на распознавание звонков — чистые правила без DI и Prisma
 * (13.11.2026: «какой портал сколько денег съел»).
 *
 * Платит April только Яндексу: VibeCode и свой Whisper в расходе — нули.
 * Яндекс считает посекундно, пару каналов — как один, а звонок короче
 * 15 секунд — как 15 секунд. Длительность берётся из строки транскрибации
 * (телефония), не из файла записи: расхождение со счётом Яндекса —
 * секунды на звонок. Не видны и попытки, когда Яндекс сорвался и звонок
 * распознал запасной: за них Яндекс, вероятно, взял деньги.
 */

/** Распознаватели в сводке расхода, в порядке показа. */
export const TRANSCRIPTION_SPEND_PROVIDERS = [
    'yandex',
    'vibecode',
    'whisper',
    'other',
] as const;
export type TranscriptionSpendProvider =
    (typeof TRANSCRIPTION_SPEND_PROVIDERS)[number];

/** Как распознаватель называется в админке. */
export const TRANSCRIPTION_SPEND_PROVIDER_LABELS: Readonly<
    Record<TranscriptionSpendProvider, string>
> = {
    yandex: 'Яндекс',
    vibecode: 'VibeCode',
    whisper: 'Свой Whisper',
    other: 'Другой',
};

/** Платный — только Яндекс. */
export const isPaidSpendProvider = (
    provider: TranscriptionSpendProvider,
): boolean => provider === 'yandex';

/** Звонок короче этого Яндекс тарифицирует как 15 секунд. */
export const YANDEX_MIN_BILLED_SEC = 15;

/** Смещение Москвы от UTC, часов (перехода на летнее время нет). */
export const MOSCOW_UTC_OFFSET_HOURS = 3;

/**
 * Распознаватель по значению колонки `transcriptions.provider`: роутер
 * пишет `yandex`, `bitrix-vibecode`, `local-whisper`; старые строки могли
 * писать иначе — сравнение без регистра и по вхождению.
 */
export function spendProviderOf(
    raw: string | null | undefined,
): TranscriptionSpendProvider {
    const value = (raw ?? '').trim().toLowerCase();
    if (value.startsWith('yandex')) return 'yandex';
    if (value.includes('vibecode')) return 'vibecode';
    if (value.includes('whisper')) return 'whisper';
    return 'other';
}

/** Месяц расхода и его границы в UTC (месяц — по Москве). */
export interface SpendMonthRange {
    /** Месяц в виде YYYY-MM. */
    month: string;
    /** Начало месяца по Москве, включительно. */
    from: Date;
    /** Начало следующего месяца по Москве, не включительно. */
    to: Date;
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

const monthKey = (year: number, monthIndex: number): string =>
    `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

const moscowMonthStart = (year: number, monthIndex: number): Date =>
    new Date(Date.UTC(year, monthIndex, 1, -MOSCOW_UTC_OFFSET_HOURS));

/** Текущий месяц по Москве: YYYY-MM. */
export function currentMoscowMonth(now: Date): string {
    const moscow = new Date(
        now.getTime() + MOSCOW_UTC_OFFSET_HOURS * 3_600_000,
    );
    return monthKey(moscow.getUTCFullYear(), moscow.getUTCMonth());
}

/**
 * Границы месяца по Москве. `month` не задан или кривой — текущий месяц.
 * `shift` сдвигает месяц: −1 — предыдущий.
 */
export function spendMonthRange(
    month: string | undefined,
    now: Date,
    shift = 0,
): SpendMonthRange {
    const match = MONTH_RE.exec(month ?? '') ?? [
        '',
        ...currentMoscowMonth(now).split('-'),
    ];
    const total = Number(match[1]) * 12 + Number(match[2]) - 1 + shift;
    const year = Math.floor(total / 12);
    const monthIndex = total % 12;
    return {
        month: monthKey(year, monthIndex),
        from: moscowMonthStart(year, monthIndex),
        to: moscowMonthStart(
            monthIndex === 11 ? year + 1 : year,
            (monthIndex + 1) % 12,
        ),
    };
}

/** Рубли за оплачиваемые секунды по цене минуты в копейках; до копеек. */
export function spendRub(billedSec: number, kopecksPerMinute: number): number {
    return Math.round((billedSec / 60) * kopecksPerMinute) / 100;
}

/** Минуты с одним знаком после запятой. */
export const spendMinutes = (sec: number): number => Math.round(sec / 6) / 10;

/**
 * Число из ответа сырого SQL: COUNT в MySQL приходит bigint, SUM — Decimal
 * (объект с toString), NULL — null.
 */
export function spendNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'bigint') return Number(value);
    const text =
        typeof value === 'string'
            ? value
            : typeof value === 'object'
              ? (value as { toString(): string }).toString()
              : '';
    const parsed = Number(text);
    return text !== '' && Number.isFinite(parsed) ? parsed : 0;
}

/** Строка агрегата: один распознаватель (как записан в базе) в срезе. */
export interface SpendAggregate {
    provider: string | null;
    calls: number;
    /** Сумма известных длительностей, секунд. */
    knownSec: number;
    /** Та же сумма, но звонок короче 15 с — как 15 с. */
    billedSec: number;
    /** Звонков без длительности: в минуты и рубли не попали. */
    unknownCalls: number;
}

/** Итог по одному распознавателю. */
export interface SpendByProvider {
    provider: TranscriptionSpendProvider;
    label: string;
    paid: boolean;
    calls: number;
    minutes: number;
    billedMinutes: number;
    rub: number;
    unknownDurationCalls: number;
}

/** Итог среза: все распознаватели и отдельно платный Яндекс. */
export interface SpendTotals {
    calls: number;
    minutes: number;
    rub: number;
    yandexCalls: number;
    yandexMinutes: number;
    unknownDurationCalls: number;
}

interface ProviderSums {
    calls: number;
    knownSec: number;
    billedSec: number;
    unknownCalls: number;
}

/**
 * Сводит строки агрегата по распознавателям в порядке
 * {@link TRANSCRIPTION_SPEND_PROVIDERS}; распознаватели без звонков не
 * показываются.
 */
export function spendByProvider(
    rows: readonly SpendAggregate[],
    kopecksPerMinute: number,
): SpendByProvider[] {
    const sums = new Map<TranscriptionSpendProvider, ProviderSums>();
    for (const row of rows) {
        const key = spendProviderOf(row.provider);
        const sum = sums.get(key) ?? {
            calls: 0,
            knownSec: 0,
            billedSec: 0,
            unknownCalls: 0,
        };
        sum.calls += row.calls;
        sum.knownSec += row.knownSec;
        sum.billedSec += row.billedSec;
        sum.unknownCalls += row.unknownCalls;
        sums.set(key, sum);
    }
    return TRANSCRIPTION_SPEND_PROVIDERS.flatMap(provider => {
        const sum = sums.get(provider);
        if (!sum || sum.calls === 0) return [];
        const paid = isPaidSpendProvider(provider);
        return [
            {
                provider,
                label: TRANSCRIPTION_SPEND_PROVIDER_LABELS[provider],
                paid,
                calls: sum.calls,
                minutes: spendMinutes(sum.knownSec),
                billedMinutes: paid ? spendMinutes(sum.billedSec) : 0,
                rub: paid ? spendRub(sum.billedSec, kopecksPerMinute) : 0,
                unknownDurationCalls: sum.unknownCalls,
            },
        ];
    });
}

/** Итог среза по уже сведённым распознавателям. */
export function spendTotals(
    providers: readonly SpendByProvider[],
): SpendTotals {
    const yandex = providers.find(item => item.provider === 'yandex');
    const sum = (pick: (item: SpendByProvider) => number): number =>
        providers.reduce((total, item) => total + pick(item), 0);
    return {
        calls: sum(item => item.calls),
        minutes: Math.round(sum(item => item.minutes) * 10) / 10,
        rub: Math.round(sum(item => item.rub) * 100) / 100,
        yandexCalls: yandex?.calls ?? 0,
        yandexMinutes: yandex?.minutes ?? 0,
        unknownDurationCalls: sum(item => item.unknownDurationCalls),
    };
}

/**
 * Группирует строки агрегата по ключу (портал, день, сотрудник) и сводит
 * каждую группу. Порядок групп — как встретились.
 */
export function spendGroups<T extends SpendAggregate>(
    rows: readonly T[],
    keyOf: (row: T) => string,
    kopecksPerMinute: number,
): Map<string, { providers: SpendByProvider[]; totals: SpendTotals }> {
    const grouped = new Map<string, T[]>();
    for (const row of rows) {
        const key = keyOf(row);
        grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }
    const result = new Map<
        string,
        { providers: SpendByProvider[]; totals: SpendTotals }
    >();
    for (const [key, group] of grouped) {
        const providers = spendByProvider(group, kopecksPerMinute);
        result.set(key, { providers, totals: spendTotals(providers) });
    }
    return result;
}
