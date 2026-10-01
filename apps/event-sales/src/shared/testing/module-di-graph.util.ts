import 'reflect-metadata';

/**
 * Статическая проверка DI-графа модуля Nest — ТОЛЬКО ДЛЯ ТЕСТОВ.
 *
 * Юнит-тесты работают на моках, и забытый импорт модуля виден только при
 * старте приложения — то есть уже в проде (боевой случай 27.08.2026:
 * event-sales не поднялся, 502). Проверка читает метаданные декораторов:
 * каждая зависимость конструктора провайдера/контроллера должна быть в
 * модуле, в экспортах его импортов или в списке глобальных.
 */

export type Ctor = new (...args: never[]) => unknown;

const NEST_MODULE_KEYS = ['imports', 'providers', 'exports', 'controllers'];

/** Классы из метаданных модуля (динамические модули-объекты пропускаются). */
export const ctorsOf = (module: Ctor, key: string): Ctor[] =>
    ((Reflect.getMetadata(key, module) as unknown[] | undefined) ?? []).filter(
        (item): item is Ctor => typeof item === 'function',
    );

function exportsOf(module: Ctor, seen = new Set<Ctor>()): Set<Ctor> {
    const result = new Set<Ctor>();
    if (seen.has(module)) return result;
    seen.add(module);
    for (const item of ctorsOf(module, 'exports')) {
        const isModule = NEST_MODULE_KEYS.some(
            key => Reflect.getMetadata(key, item) !== undefined,
        );
        if (isModule) {
            for (const nested of exportsOf(item, seen)) result.add(nested);
            continue;
        }
        result.add(item);
    }
    return result;
}

/** Что доступно для внедрения внутри модуля. */
export function availableIn(
    module: Ctor,
    globals: readonly Ctor[] = [],
): Set<Ctor> {
    const available = new Set<Ctor>([
        ...ctorsOf(module, 'providers'),
        ...globals,
    ]);
    for (const imported of ctorsOf(module, 'imports')) {
        for (const exported of exportsOf(imported)) available.add(exported);
    }
    return available;
}

/** Зависимости конструктора (классы; примитивы и Object пропускаются). */
export function dependenciesOf(target: Ctor): Ctor[] {
    const params =
        (Reflect.getMetadata('design:paramtypes', target) as
            | unknown[]
            | undefined) ?? [];
    return params.filter(
        (param): param is Ctor =>
            typeof param === 'function' &&
            ![Object, String, Number, Boolean, Array, Function].includes(
                param as never,
            ),
    );
}

/**
 * Недоступные зависимости «Цель → Зависимость» для указанных классов
 * модуля (по умолчанию — все провайдеры и контроллеры). Пусто — граф цел.
 */
export function missingDependencies(
    module: Ctor,
    globals: readonly Ctor[] = [],
    targets: readonly Ctor[] = [
        ...ctorsOf(module, 'providers'),
        ...ctorsOf(module, 'controllers'),
    ],
): string[] {
    const available = availableIn(module, globals);
    const missing: string[] = [];
    for (const target of targets) {
        for (const dependency of dependenciesOf(target)) {
            if (!available.has(dependency)) {
                missing.push(`${target.name} → ${dependency.name}`);
            }
        }
    }
    return missing;
}
