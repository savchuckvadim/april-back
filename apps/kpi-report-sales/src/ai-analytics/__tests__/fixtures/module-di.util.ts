import 'reflect-metadata';

/**
 * Статическая проверка DI-графа модуля без поднятия Nest (по образцу
 * `ai-analytics-module-di.spec.ts`): каждая зависимость конструктора
 * провайдера обязана быть в его собственных провайдерах либо в экспортах
 * импортируемых модулей.
 *
 * Вынесено в фикстуру, чтобы модули срезов Фазы 2 проверялись тем же
 * кодом, а не его копией.
 */
export type Ctor = new (...args: never[]) => unknown;

export function metadataList(module: Ctor, key: string): Ctor[] {
    const items =
        (Reflect.getMetadata(key, module) as unknown[] | undefined) ?? [];
    return items.filter((item): item is Ctor => typeof item === 'function');
}

function isModule(candidate: Ctor): boolean {
    return ['imports', 'providers', 'exports', 'controllers'].some(
        key => Reflect.getMetadata(key, candidate) !== undefined,
    );
}

/** Что модуль отдаёт наружу (вложенные модули — рекурсивно). */
export function exportsOf(module: Ctor, seen = new Set<Ctor>()): Set<Ctor> {
    const result = new Set<Ctor>();
    if (seen.has(module)) return result;
    seen.add(module);
    for (const item of metadataList(module, 'exports')) {
        if (isModule(item)) {
            for (const nested of exportsOf(item, seen)) result.add(nested);
        } else {
            result.add(item);
        }
    }
    return result;
}

/** Что доступно внутри модуля: свои провайдеры, экспорты импортов, глобальные. */
export function availableIn(module: Ctor, globals: Ctor[] = []): Set<Ctor> {
    const available = new Set<Ctor>([
        ...metadataList(module, 'providers'),
        ...globals,
    ]);
    for (const imported of metadataList(module, 'imports')) {
        for (const exported of exportsOf(imported)) available.add(exported);
    }
    return available;
}

export function dependenciesOf(provider: Ctor): Ctor[] {
    const params =
        (Reflect.getMetadata('design:paramtypes', provider) as
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

/** Незакрытые зависимости модуля строками «Провайдер → Зависимость». */
export function missingDependencies(
    module: Ctor,
    globals: Ctor[] = [],
): string[] {
    const available = availableIn(module, globals);
    const missing: string[] = [];
    const units = [
        ...metadataList(module, 'providers'),
        ...metadataList(module, 'controllers'),
    ];
    for (const unit of units) {
        for (const dependency of dependenciesOf(unit)) {
            if (!available.has(dependency)) {
                missing.push(`${unit.name} → ${dependency.name}`);
            }
        }
    }
    return missing;
}
