/**
 * Детерминированный ГПСЧ модели AI-аналитики ОП (план `ai-sales-analytics`,
 * §4.5 «разложение разрыва», §4.10 «рычаги», §2.4 «воспроизводимость»).
 *
 * `Math.random` и `Date.now` в библиотеке запрещены: поток случайности
 * задаётся seed'ом, а seed собирается из ключа расчёта
 * (`domain | managerId | date | calcVersion`), чтобы `recompute` на той же
 * фикстуре воспроизводил числа с относительным |Δ| ≤ 1e-9.
 */

/** Множитель FNV-1a (32 бита) и смещение — константы алгоритма. */
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Делитель uint32 → [0; 1). */
const UINT32 = 4294967296;

/** Разделитель частей ключа seed'а. */
export const SEED_SEPARATOR = '|';

/**
 * FNV-1a: строка → uint32. Нужен только для воспроизводимого seed'а,
 * криптостойкости не даёт и для хэшей снапшотов не применяется.
 */
export function fnv1a(text: string): number {
    let hash = FNV_OFFSET_BASIS;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, FNV_PRIME);
    }

    return hash >>> 0;
}

/**
 * Seed из частей ключа расчёта: `seedOf(domain, managerId, date, calcVersion)`.
 * Порядок частей значим — он и есть определение потока случайности.
 */
export function seedOf(...parts: readonly (string | number)[]): number {
    return fnv1a(parts.map(part => String(part)).join(SEED_SEPARATOR));
}

/**
 * mulberry32: быстрый ГПСЧ с периодом 2³², достаточным для 2000 сэмплов
 * апостериоров и 200 перемешиваний перестановочного теста.
 */
export function mulberry32(seed: number): () => number {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / UINT32;
    };
}

/** Стандартная нормаль по Боксу–Мюллеру из того же потока. */
export function sampleNormal(random: () => number): number {
    const u1 = Math.max(random(), 1e-12);
    const u2 = random();

    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Gamma(shape, 1) методом Марсальи–Цанга (rate = 1; для другой скорости
 * значение делится на неё вызывающим кодом). shape < 1 — через степенное
 * преобразование Gamma(shape + 1)·U^(1/shape).
 */
export function sampleGamma(shape: number, random: () => number): number {
    if (!Number.isFinite(shape) || shape <= 0) {
        return 0;
    }
    if (shape < 1) {
        const boosted = sampleGamma(shape + 1, random);

        return boosted * Math.pow(Math.max(random(), 1e-12), 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (let guard = 0; guard < 1000; guard += 1) {
        const x = sampleNormal(random);
        const v = Math.pow(1 + c * x, 3);
        if (v <= 0) {
            continue;
        }
        const u = Math.max(random(), 1e-12);
        if (u < 1 - 0.0331 * Math.pow(x, 4)) {
            return d * v;
        }
        if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
            return d * v;
        }
    }

    return d;
}

/**
 * Beta(alpha, beta) через две гаммы: X/(X + Y). Вырожденные параметры
 * (≤ 0) дают 0 или 1 — апостериор с нулевой массой на одной стороне.
 */
export function sampleBeta(
    alpha: number,
    beta: number,
    random: () => number,
): number {
    if (!Number.isFinite(alpha) || !Number.isFinite(beta)) {
        return 0;
    }
    if (alpha <= 0) {
        return 0;
    }
    if (beta <= 0) {
        return 1;
    }
    const x = sampleGamma(alpha, random);
    const y = sampleGamma(beta, random);
    const sum = x + y;

    return sum > 0 ? x / sum : alpha / (alpha + beta);
}

/**
 * Binomial(n, p) прямым перебором испытаний: n в модели — счёт эпизодов
 * за месяц (сотни), поэтому точность важнее скорости.
 */
export function sampleBinomial(
    trials: number,
    probability: number,
    random: () => number,
): number {
    const n = Math.max(0, Math.floor(trials));
    const p = Math.min(1, Math.max(0, probability));
    let hits = 0;
    for (let trial = 0; trial < n; trial += 1) {
        if (random() < p) {
            hits += 1;
        }
    }

    return hits;
}
