/**
 * Значения JSON статьи: блоки и свойства (meta) приходят из админки и из
 * базы как `unknown` и проверяются здесь, без `any`.
 */

export type SiteArticleJson =
    | string
    | number
    | boolean
    | null
    | SiteArticleJson[]
    | SiteArticleJsonObject;

export interface SiteArticleJsonObject {
    [key: string]: SiteArticleJson;
}

export interface SiteArticleJsonLimits {
    /** Самая длинная строка в знаках. */
    maxString: number;
    /** Самая глубокая вложенность объектов и списков. */
    maxDepth: number;
}

export interface SiteArticleJsonProblem {
    /** Путь до значения: `items[2].text`; '' — само значение. */
    path: string;
    message: string;
}

/** Обычный объект: не список, не null, не экземпляр класса вроде Date. */
export const isPlainObject = (
    value: unknown,
): value is Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    const proto: unknown = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
};

const join = (path: string, key: string): string =>
    path ? `${path}.${key}` : key;

/**
 * Первая проблема значения как JSON статьи или null: только строки,
 * конечные числа, да/нет, null, списки и обычные объекты, в пределах
 * длины строки и глубины.
 */
export function findJsonProblem(
    value: unknown,
    limits: SiteArticleJsonLimits,
    path = '',
    depth = 0,
): SiteArticleJsonProblem | null {
    if (value === null || typeof value === 'boolean') return null;
    if (typeof value === 'string') {
        return value.length > limits.maxString
            ? { path, message: `текст длиннее ${limits.maxString} знаков` }
            : null;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value)
            ? null
            : { path, message: 'число должно быть конечным' };
    }
    if (!Array.isArray(value) && !isPlainObject(value)) {
        return { path, message: 'значение не из JSON' };
    }
    if (depth >= limits.maxDepth) {
        return {
            path,
            message: `вложенность глубже ${limits.maxDepth} уровней`,
        };
    }
    const entries: [string, unknown][] = Array.isArray(value)
        ? value.map((item, index) => [`${path}[${index}]`, item])
        : Object.entries(value).map(([key, item]) => [join(path, key), item]);
    for (const [itemPath, item] of entries) {
        const problem = findJsonProblem(item, limits, itemPath, depth + 1);
        if (problem) return problem;
    }
    return null;
}

/** Проверенное значение JSON (findJsonProblem вернул null). */
export const isSiteArticleJson = (
    value: unknown,
    limits: SiteArticleJsonLimits,
): value is SiteArticleJson => findJsonProblem(value, limits) === null;

export const jsonBytes = (value: SiteArticleJson): number =>
    Buffer.byteLength(JSON.stringify(value), 'utf8');
