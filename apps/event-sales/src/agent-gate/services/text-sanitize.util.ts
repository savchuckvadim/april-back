/**
 * Очистка текстов от LaTeX-артефактов LLM.
 *
 * Модели, обученные на научных текстах, вставляют в обычную прозу
 * математическую разметку: «(следствие) $\leftarrow$ (причина)»,
 * «\textbf{важно}», «100\%». В карточке Битрикса это выглядит как куски
 * кода (боевой кейс 27.08.2026, элемент 206 alfacentr). Промптом такое
 * лечится ненадёжно — чистим кодом на входе.
 */

/** Известные символы LaTeX → человеческие эквиваленты. */
const LATEX_SYMBOLS: [RegExp, string][] = [
    [/\\(?:Leftarrow|leftarrow|gets)\b/g, '←'],
    [/\\(?:Rightarrow|rightarrow|to)\b/g, '→'],
    [/\\(?:Leftrightarrow|leftrightarrow)\b/g, '↔'],
    [/\\(?:Uparrow|uparrow)\b/g, '↑'],
    [/\\(?:Downarrow|downarrow)\b/g, '↓'],
    [/\\(?:times|cdot)\b/g, '×'],
    [/\\approx\b/g, '≈'],
    [/\\(?:neq|ne)\b/g, '≠'],
    [/\\(?:geq|ge)\b/g, '≥'],
    [/\\(?:leq|le)\b/g, '≤'],
];

/** Обёртки вида \textbf{...} — оставляем только содержимое. */
const LATEX_WRAPPERS =
    /\\(?:textbf|textit|emph|mathrm|mathbf|text|underline)\{([^{}]*)\}/g;

/**
 * Снимает LaTeX-разметку с текста, сохраняя смысл.
 */
export function sanitizeLatex(value: string): string {
    let result = value;
    // 1. Обёртки команд: \textbf{Важно} → Важно (несколько проходов —
    //    на случай вложенности вида \textbf{\emph{x}}).
    for (let pass = 0; pass < 3; pass++) {
        const next = result.replace(LATEX_WRAPPERS, '$1');
        if (next === result) break;
        result = next;
    }
    // 2. Символы — и внутри математических вставок, и вне их.
    for (const [pattern, replacement] of LATEX_SYMBOLS) {
        result = result.replace(pattern, replacement);
    }
    // 3. Сами вставки $…$ / \(…\): разметку убираем, содержимое (уже
    //    человеческий текст после шага 2) оставляем.
    result = result
        .replace(/\$\$([\s\S]*?)\$\$/g, '$1')
        .replace(/\$([^$\n]{0,200}?)\$/g, '$1')
        .replace(/\\\(([\s\S]*?)\\\)/g, '$1')
        .replace(/\\\[([\s\S]*?)\\\]/g, '$1');
    // 4. Экранирование обычных символов: 100\% → 100%, \_ → _.
    result = result.replace(/\\([%_&#{}$])/g, '$1');
    // 5. Схлопывание пробелов, появившихся на месте вырезанной разметки.
    return result.replace(/[ \t]{2,}/g, ' ').trim();
}

/** Рекурсивная очистка всех строк структуры (строки/массивы/объекты). */
export function sanitizeLatexDeep<T>(value: T): T {
    if (typeof value === 'string') return sanitizeLatex(value) as unknown as T;
    if (Array.isArray(value)) {
        return (value as unknown[]).map(item =>
            sanitizeLatexDeep(item),
        ) as unknown as T;
    }
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value)) {
            out[key] = sanitizeLatexDeep(item);
        }
        return out as T;
    }
    return value;
}
