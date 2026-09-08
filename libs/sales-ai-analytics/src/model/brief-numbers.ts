/**
 * Нормализация и форматирование чисел AI-резюме (план §8).
 *
 * Факт-чек чувствителен к форматированию: если presenter печатает число
 * одним способом, а проверка разбирает другим, живые ответы модели начнут
 * падать на приёмке «≥ 95 % буллетов проходят факт-чек». Поэтому и сборка
 * пакета фактов, и факт-чек, и presenter витрины обязаны пользоваться
 * этими функциями, а не собственным `toFixed` / `toLocaleString`.
 *
 * Чистые функции: без DI, без времени и случайности.
 */
import type { AiBriefFactUnit } from '../contracts/ai-brief.contract';

/** Неразрывный пробел — им группируются разряды в тексте фактов. */
const NBSP = '\u00A0';

/** Разряды: 1234567 → «1 234 567» (неразрывные пробелы). */
function groupDigits(text: string): string {
    const [intPart, fracPart] = text.split('.');
    const sign = intPart.startsWith('-') ? '-' : '';
    const digits = sign ? intPart.slice(1) : intPart;
    const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);

    return fracPart === undefined
        ? `${sign}${grouped}`
        : `${sign}${grouped},${fracPart}`;
}

/** Число с фиксированным числом знаков и запятой в дробной части. */
function decimal(value: number, digits: number): string {
    const fixed = value.toFixed(digits);

    return groupDigits(
        digits > 0 && fixed.endsWith('0'.repeat(digits))
            ? fixed.slice(0, -1 - digits)
            : fixed,
    );
}

/**
 * Текст в сравнимом виде: нижний регистр, «ё» → «е», неразрывные пробелы и
 * длинные тире — в обычные, схлопнутые пробелы.
 */
export function normalizeBriefText(text: string): string {
    return text
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[\u00A0\u2007\u202F]/g, ' ')
        .replace(/[−‒–—]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Канонический ключ числа для сверки: округление до двух знаков,
 * `-0` → `0`, всегда два знака после точки. «45», «45,0» и «45.004» дают
 * один ключ — иначе факт-чек ловил бы форматирование, а не факты.
 */
export function numberKey(value: number): string {
    if (!Number.isFinite(value)) {
        return 'nan';
    }
    const rounded = Math.round(value * 100) / 100;

    return (rounded === 0 ? 0 : rounded).toFixed(2);
}

/**
 * Ключи числа с допуском округления: само число, до одного знака и до
 * целого. Модель вправе написать «45» там, где в пакете 45,23.
 */
export function numberKeys(value: number): string[] {
    if (!Number.isFinite(value)) {
        return [];
    }

    return [
        numberKey(value),
        numberKey(Math.round(value * 10) / 10),
        numberKey(Math.round(value)),
    ];
}

/**
 * Ключи числа факта с учётом единицы: доля печатается процентами, рубли —
 * тысячами и миллионами, поэтому эти формы тоже считаются «числом из пакета».
 */
export function factValueKeys(value: number, unit: AiBriefFactUnit): string[] {
    const variants: number[] = [value];
    if (unit === 'share') {
        variants.push(value * 100);
    }
    if (unit === 'pct') {
        variants.push(value / 100);
    }
    if (unit === 'rub') {
        variants.push(value / 1000, value / 1_000_000);
    }

    return variants.flatMap(numberKeys);
}

/**
 * Человеческое представление значения факта. Единственный способ печатать
 * числа в пакете и шаблонном резюме — так факт-чек и текст всегда сходятся.
 */
export function formatFactValue(
    value: number | null,
    unit: AiBriefFactUnit,
): string {
    if (value === null || !Number.isFinite(value)) {
        return 'нет данных';
    }
    switch (unit) {
        case 'pct':
            return `${decimal(value, 1)} %`;
        case 'share':
            return `${decimal(value * 100, 1)} %`;
        case 'rub':
            return `${decimal(Math.round(value), 0)} ₽`;
        case 'sec':
            return `${decimal(Math.round(value), 0)} с`;
        case 'days':
            return `${decimal(value, 1)} дн.`;
        case 'score':
            return decimal(value, 1);
        default:
            return decimal(Math.round(value), 0);
    }
}

/** Даты и время: их числа в факт-чек не попадают. */
const DATE_PATTERNS: readonly RegExp[] = [
    /\d{4}-\d{2}-\d{2}/g,
    /\d{4}-w\d{2}/gi,
    /\d{4}-\d{2}\b/g,
    /\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/g,
    /\b\d{1,2}:\d{2}\b/g,
];

/** Число: с разрядами через пробел и с любой десятичной запятой/точкой. */
const NUMBER_PATTERN = /-?\d{1,3}(?: \d{3})+(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?/g;

/**
 * Числа из текста буллета в порядке появления. Даты, недели и время
 * вырезаются до разбора — «2026-09-08» не число отчёта.
 */
export function extractNumbers(text: string): number[] {
    let cleaned = normalizeBriefText(text);
    for (const pattern of DATE_PATTERNS) {
        cleaned = cleaned.replace(pattern, ' ');
    }
    const found: readonly string[] = cleaned.match(NUMBER_PATTERN) ?? [];

    return found
        .map(token => Number(token.replace(/ /g, '').replace(',', '.')))
        .filter(value => Number.isFinite(value));
}
