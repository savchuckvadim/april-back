import 'reflect-metadata';

/**
 * Статическая проверка DI-графа Nest-модуля для юнит-тестов: каждая
 * зависимость конструктора провайдера и контроллера обязана быть доступна
 * в модуле или в экспортах его импортов (с учётом реэкспорта модулей).
 *
 * ЗАЧЕМ: юнит-тесты работают на моках, и забытый импорт модуля виден только
 * при старте приложения — уже в проде (боевые случаи 26–27.08.2026, грабли
 * из ai/rules/app-api-surface.md: модуль видит лишь то, что импорт
 * ЭКСПОРТИРУЕТ).
 *
 * Глобальные модули (ConfigModule.forRoot, TelegramModule) статически не
 * видны: их провайдеры передаются в `globals`.
 */

type Ctor = new (...args: never[]) => unknown;

const NEST_MODULE_KEYS = ['imports', 'providers', 'exports', 'controllers'];

/** Примитивы и Object — не DI-токены (параметры без типа, union и т.п.). */
const NOT_INJECTABLE: readonly unknown[] = [
    Object,
    String,
    Number,
    Boolean,
    Array,
    Function,
];

const ctorsOf = (module: Ctor, key: string): Ctor[] =>
    ((Reflect.getMetadata(key, module) as unknown[] | undefined) ?? []).filter(
        (item): item is Ctor => typeof item === 'function',
    );

const isNestModule = (item: Ctor): boolean =>
    NEST_MODULE_KEYS.some(key => Reflect.getMetadata(key, item) !== undefined);

function exportsOf(module: Ctor, seen = new Set<Ctor>()): Set<Ctor> {
    const result = new Set<Ctor>();
    if (seen.has(module)) return result;
    seen.add(module);
    for (const item of ctorsOf(module, 'exports')) {
        if (isNestModule(item)) {
            for (const nested of exportsOf(item, seen)) result.add(nested);
            continue;
        }
        result.add(item);
    }
    return result;
}

/** Токены провайдеров вида `{ provide: AbstractRepo, useClass: … }`. */
const providedTokensOf = (module: Ctor): Ctor[] =>
    ((Reflect.getMetadata('providers', module) as unknown[] | undefined) ?? [])
        .map(item =>
            item && typeof item === 'object' && 'provide' in item
                ? (item as { provide: unknown }).provide
                : null,
        )
        .filter((token): token is Ctor => typeof token === 'function');

function availableIn(module: Ctor, globals: readonly Ctor[]): Set<Ctor> {
    const available = new Set<Ctor>([
        ...ctorsOf(module, 'providers'),
        ...providedTokensOf(module),
        ...globals,
    ]);
    for (const imported of ctorsOf(module, 'imports')) {
        for (const exported of exportsOf(imported)) available.add(exported);
    }
    return available;
}

function dependenciesOf(target: Ctor): Ctor[] {
    const params =
        (Reflect.getMetadata('design:paramtypes', target) as
            | unknown[]
            | undefined) ?? [];
    return params.filter(
        (param): param is Ctor =>
            typeof param === 'function' && !NOT_INJECTABLE.includes(param),
    );
}

/**
 * Недоступные зависимости модуля в виде «Потребитель → Зависимость».
 * Пустой массив — граф собран.
 */
export function findMissingModuleDependencies(
    module: Ctor,
    globals: readonly Ctor[] = [],
): string[] {
    const available = availableIn(module, globals);
    const missing: string[] = [];
    const consumers = [
        ...ctorsOf(module, 'providers'),
        ...ctorsOf(module, 'controllers'),
    ];
    for (const consumer of consumers) {
        for (const dependency of dependenciesOf(consumer)) {
            if (!available.has(dependency)) {
                missing.push(`${consumer.name} → ${dependency.name}`);
            }
        }
    }
    return missing;
}
