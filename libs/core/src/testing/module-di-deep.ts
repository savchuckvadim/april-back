import 'reflect-metadata';
import {
    GLOBAL_MODULE_METADATA,
    INJECTABLE_WATERMARK,
    OPTIONAL_DEPS_METADATA,
    SELF_DECLARED_DEPS_METADATA,
} from '@nestjs/common/constants';
import {
    HttpAdapterHost,
    LazyModuleLoader,
    ModuleRef,
    ModulesContainer,
    Reflector,
} from '@nestjs/core';

/**
 * Проверка DI-графа ВСЕГО дерева модулей, как при старте приложения.
 *
 * `findMissingModuleDependencies` смотрит один модуль; дыра во вложенном
 * модуле библиотеки видна только при старте. Боевой случай 29.10.2026:
 * bot не поднялся, потому что ядро ai-rag пришло через @lib/llm-gateway,
 * а StorageService в приложении не было.
 *
 * Учитывает динамические модули (`forRoot`), глобальные модули,
 * `forwardRef`, `@Optional()` и `@Inject(Класс)`. Строковые токены и
 * фабрики не проверяются.
 */

type Ctor = abstract new (...args: never[]) => unknown;

interface DynamicModuleLike {
    module: Ctor;
    imports?: unknown[];
    providers?: unknown[];
    exports?: unknown[];
    controllers?: unknown[];
    global?: boolean;
}

interface ModuleNode {
    module: Ctor;
    imports: unknown[];
    providers: unknown[];
    exports: unknown[];
    controllers: unknown[];
    global: boolean;
}

interface SelfDeclaredDep {
    index: number;
    param: unknown;
}

/** Провайдеры ядра Nest: доступны любому модулю без импорта. */
const NEST_CORE_PROVIDERS: readonly Ctor[] = [
    Reflector,
    ModulesContainer,
    ModuleRef,
    HttpAdapterHost,
    LazyModuleLoader,
];

const NOT_INJECTABLE: readonly unknown[] = [
    Object,
    String,
    Number,
    Boolean,
    Array,
    Function,
];

const isCtor = (item: unknown): item is Ctor => typeof item === 'function';

const isObject = (item: unknown): item is Record<string, unknown> =>
    typeof item === 'object' && item !== null;

const isDynamic = (item: unknown): item is DynamicModuleLike =>
    isObject(item) && isCtor(item.module);

/** `forwardRef(() => X)` → X; остальное как есть. */
function unwrap(item: unknown): unknown {
    if (isObject(item) && typeof item.forwardRef === 'function') {
        return (item.forwardRef as () => unknown)();
    }
    return item;
}

const meta = (key: string, target: Ctor): unknown[] =>
    (Reflect.getMetadata(key, target) as unknown[] | undefined) ?? [];

const isGlobalClass = (target: Ctor): boolean =>
    Reflect.getMetadata(GLOBAL_MODULE_METADATA, target) === true;

/**
 * Модуль: есть метаданные @Module или пометка @Global без @Injectable.
 * Сервисы StorageService и PrismaService помечены @Global(), но это
 * провайдеры, а не модули.
 */
const isModuleClass = (target: Ctor): boolean =>
    ['imports', 'providers', 'exports', 'controllers'].some(
        key => Reflect.getMetadata(key, target) !== undefined,
    ) ||
    (isGlobalClass(target) &&
        Reflect.getMetadata(INJECTABLE_WATERMARK, target) !== true);

function toNode(item: unknown): ModuleNode | null {
    const value = unwrap(item);
    if (isDynamic(value)) {
        const base = value.module;
        return {
            module: base,
            imports: [...meta('imports', base), ...(value.imports ?? [])],
            providers: [...meta('providers', base), ...(value.providers ?? [])],
            exports: [...meta('exports', base), ...(value.exports ?? [])],
            controllers: [
                ...meta('controllers', base),
                ...(value.controllers ?? []),
            ],
            global: value.global === true || isGlobalClass(base),
        };
    }
    if (!isCtor(value) || !isModuleClass(value)) return null;
    return {
        module: value,
        imports: meta('imports', value),
        providers: meta('providers', value),
        exports: meta('exports', value),
        controllers: meta('controllers', value),
        global: isGlobalClass(value),
    };
}

/** Токен провайдера: класс или `{ provide: Класс }`. */
function tokenOf(provider: unknown): Ctor | null {
    if (isCtor(provider)) return provider;
    if (isObject(provider) && isCtor(provider.provide)) return provider.provide;
    return null;
}

/** Класс, чей конструктор вызывает Nest: сам класс или `useClass`. */
function constructedOf(provider: unknown): Ctor | null {
    if (isCtor(provider)) return provider;
    if (isObject(provider) && isCtor(provider.useClass)) {
        return provider.useClass;
    }
    return null;
}

function dependenciesOf(target: Ctor): Ctor[] {
    const params = [...meta('design:paramtypes', target)];
    const declared = meta(
        SELF_DECLARED_DEPS_METADATA,
        target,
    ) as SelfDeclaredDep[];
    for (const dep of declared) params[dep.index] = dep.param;
    const optional = new Set(meta(OPTIONAL_DEPS_METADATA, target) as number[]);
    return params
        .map(unwrap)
        .filter(
            (param, index): param is Ctor =>
                !optional.has(index) &&
                isCtor(param) &&
                !NOT_INJECTABLE.includes(param),
        );
}

const mergeUnique = (target: unknown[], extra: unknown[]): void => {
    for (const item of extra) if (!target.includes(item)) target.push(item);
};

/** Все модули дерева; один класс модуля сливается в один узел. */
function collect(root: unknown): Map<Ctor, ModuleNode> {
    const nodes = new Map<Ctor, ModuleNode>();
    const queue: unknown[] = [root];
    while (queue.length) {
        const node = toNode(queue.shift());
        if (!node) continue;
        const known = nodes.get(node.module);
        if (known) {
            mergeUnique(known.providers, node.providers);
            mergeUnique(known.exports, node.exports);
            known.global = known.global || node.global;
            continue;
        }
        nodes.set(node.module, node);
        queue.push(...node.imports);
    }
    return nodes;
}

function exportsOf(
    module: Ctor,
    nodes: Map<Ctor, ModuleNode>,
    seen = new Set<Ctor>(),
): Set<Ctor> {
    const result = new Set<Ctor>();
    const node = nodes.get(module);
    if (!node || seen.has(module)) return result;
    seen.add(module);
    for (const item of node.exports) {
        const nested = toNode(item);
        if (nested) {
            for (const token of exportsOf(nested.module, nodes, seen)) {
                result.add(token);
            }
            continue;
        }
        const token = tokenOf(unwrap(item));
        if (token) result.add(token);
    }
    return result;
}

function availableIn(
    node: ModuleNode,
    nodes: Map<Ctor, ModuleNode>,
    globals: Set<Ctor>,
): Set<Ctor> {
    const available = new Set<Ctor>(globals);
    for (const provider of node.providers) {
        const token = tokenOf(provider);
        if (token) available.add(token);
    }
    for (const imported of node.imports) {
        const child = toNode(imported);
        if (!child) continue;
        for (const token of exportsOf(child.module, nodes))
            available.add(token);
    }
    return available;
}

/**
 * Недоступные зависимости во всём дереве в виде
 * «Модуль: Потребитель → Зависимость». Пустой массив — приложение соберётся.
 * @param globals провайдеры, которые приложение даёт вне дерева.
 */
export function findMissingDependenciesDeep(
    root: unknown,
    globals: readonly Ctor[] = [],
): string[] {
    const nodes = collect(root);
    const globalTokens = new Set<Ctor>([...NEST_CORE_PROVIDERS, ...globals]);
    for (const node of nodes.values()) {
        if (!node.global) continue;
        for (const token of exportsOf(node.module, nodes)) {
            globalTokens.add(token);
        }
    }

    const missing = new Set<string>();
    for (const node of nodes.values()) {
        const available = availableIn(node, nodes, globalTokens);
        const consumers = [
            ...node.providers.map(constructedOf),
            ...node.controllers.map(unwrap).filter(isCtor),
        ].filter((item): item is Ctor => item !== null);
        for (const consumer of consumers) {
            for (const dependency of dependenciesOf(consumer)) {
                if (!available.has(dependency)) {
                    missing.add(
                        `${node.module.name}: ${consumer.name} → ${dependency.name}`,
                    );
                }
            }
        }
    }
    return [...missing];
}
