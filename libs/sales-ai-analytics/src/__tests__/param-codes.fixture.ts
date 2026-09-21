import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Сканер исходников для приёмочных спек Фазы 2 (план §6: «каждый строковый
 * код параметра из кода есть в реестре», «about-текст ручки содержит все
 * коды, которые она использует»). Работает по файлам через `fs`, а не по
 * импортам модулей: спеки не должны зависеть от состояния соседних
 * потоков, которые правят те же файлы.
 *
 * Здесь только чтение и регулярные выражения — без DI и без побочных
 * эффектов; фикстура общая для спек библиотеки и приложения.
 */

/** Корень репозитория: libs/sales-ai-analytics/src/__tests__ → back. */
export const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
export const LIB_SRC_DIR = resolve(__dirname, '..');
export const APP_AI_ANALYTICS_DIR = join(
    REPO_ROOT,
    'apps',
    'kpi-report-sales',
    'src',
    'ai-analytics',
);

/** Литерал кода в вызове функций реестра (многострочный вызов тоже). */
export const PARAM_CODE_CALL_RE =
    /\b(?:resolveParam|resolveNumberParam|registryDefault|findParam|registryEnumDefault|registryRangeOf)\s*(?:<[^>]*>)?\s*\(\s*'([A-Za-z0-9_]+)'/g;

/** Литерал кода, закреплённый `satisfies AiAnalyticsParamCode`. */
export const PARAM_CODE_SATISFIES_RE =
    /'([A-Za-z0-9_]+)'\s+satisfies\s+AiAnalyticsParamCode\b/g;

const IMPORT_RE = /import\s+(type\s+)?([\s\S]*?)\s+from\s+'([^']+)';/g;
const EXPORT_RE =
    /export\s+(?:declare\s+)?(?:async\s+)?(?:abstract\s+)?(?:function|const|class|let|var|enum|interface|type)\s+([\w$]+)/g;
const LIB_ALIAS = '@lib/sales-ai-analytics';

/** Рабочие .ts-файлы каталога (без спек, деклараций и `__tests__`). */
export function tsSourcesUnder(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
            if (entry !== '__tests__') out.push(...tsSourcesUnder(path));
        } else if (
            path.endsWith('.ts') &&
            !path.endsWith('.spec.ts') &&
            !path.endsWith('.d.ts')
        ) {
            out.push(path);
        }
    }
    return out.sort();
}

/**
 * Текст без комментариев: блочных и строчных. Строчный комментарий —
 * `//` не после `:`, кавычки или обратного слэша, чтобы `https://…` внутри
 * строк не считалось комментарием.
 */
export function stripComments(text: string): string {
    return text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

/** Все литералы кодов параметров в тексте (комментарии не считаются). */
export function paramCodeLiterals(text: string): Set<string> {
    const codes = new Set<string>();
    const source = stripComments(text);
    for (const re of [PARAM_CODE_CALL_RE, PARAM_CODE_SATISFIES_RE]) {
        re.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = re.exec(source)) !== null) codes.add(match[1]);
    }
    return codes;
}

/** Код → файл(ы) с его объявлением `export function|const|class|…`. */
export function exportIndexOf(files: readonly string[]): Map<string, string[]> {
    const index = new Map<string, string[]>();
    for (const file of files) {
        const text = readFileSync(file, 'utf8');
        EXPORT_RE.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = EXPORT_RE.exec(text)) !== null) {
            index.set(match[1], [...(index.get(match[1]) ?? []), file]);
        }
    }
    return index;
}

function resolveModule(base: string): string | null {
    for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
        if (existsSync(candidate)) return candidate;
    }
    return null;
}

/**
 * Файлы, которые файл импортирует В РАНТАЙМЕ: относительные пути, глубокие
 * пути `@lib/sales-ai-analytics/…` и именованные импорты из барреля
 * библиотеки (имя → файл объявления по индексу экспортов). `import type`
 * и спецификаторы `type X` не считаются: тип не несёт кода параметра.
 */
export function runtimeImportsOf(
    file: string,
    libIndex: ReadonlyMap<string, string[]>,
): string[] {
    const text = readFileSync(file, 'utf8');
    const found = new Set<string>();
    IMPORT_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = IMPORT_RE.exec(text)) !== null) {
        const [, typeOnly, names, spec] = match;
        if (typeOnly) continue;
        if (spec.startsWith('.')) {
            const resolved = resolveModule(resolve(dirname(file), spec));
            if (resolved) found.add(resolved);
        } else if (spec === LIB_ALIAS) {
            const inner = /\{([\s\S]*)\}/.exec(names);
            for (const raw of inner?.[1].split(',') ?? []) {
                const name = raw.trim();
                if (name === '' || name.startsWith('type ')) continue;
                const exported = name.split(/\s+as\s+/)[0].trim();
                for (const owner of libIndex.get(exported) ?? []) {
                    found.add(owner);
                }
            }
        } else if (spec.startsWith(`${LIB_ALIAS}/`)) {
            const resolved = resolveModule(
                join(LIB_SRC_DIR, spec.slice(LIB_ALIAS.length + 1)),
            );
            if (resolved) found.add(resolved);
        }
    }
    return [...found];
}

const normalize = (path: string): string => path.replace(/\\/g, '/');

/**
 * Транзитивное замыкание рантайм-импортов от входных файлов внутри
 * разрешённых корней. Каталог `params/` библиотеки — граница обхода: это
 * сам реестр, его коды принадлежат всем ручкам сразу.
 */
export function transitiveSources(
    entries: readonly string[],
    roots: readonly string[],
    libIndex: ReadonlyMap<string, string[]>,
): string[] {
    const allowed = roots.map(normalize);
    const seen = new Set<string>();
    const stack = [...entries];
    while (stack.length > 0) {
        const file = stack.pop() as string;
        if (seen.has(file)) continue;
        const path = normalize(file);
        if (!allowed.some(root => path.startsWith(root))) continue;
        seen.add(file);
        if (path.includes('/params/')) continue;
        stack.push(...runtimeImportsOf(file, libIndex));
    }
    return [...seen].sort();
}

/** Коды параметров, до которых файлы дотягиваются транзитивно. */
export function paramCodesReachableFrom(
    entries: readonly string[],
    roots: readonly string[],
    libIndex: ReadonlyMap<string, string[]>,
): Set<string> {
    const codes = new Set<string>();
    for (const file of transitiveSources(entries, roots, libIndex)) {
        for (const code of paramCodeLiterals(readFileSync(file, 'utf8'))) {
            codes.add(code);
        }
    }
    return codes;
}
