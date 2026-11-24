import 'reflect-metadata';
import { inspect } from 'util';
import {
    Controller,
    Global,
    Inject,
    Injectable,
    Optional,
    UseGuards,
    forwardRef,
} from '@nestjs/common';
import type { CanActivate, DynamicModule } from '@nestjs/common';
import {
    CATCH_WATERMARK,
    CONTROLLER_WATERMARK,
    EXCEPTION_FILTERS_METADATA,
    GLOBAL_MODULE_METADATA,
    GUARDS_METADATA,
    INJECTABLE_WATERMARK,
    INTERCEPTORS_METADATA,
    OPTIONAL_DEPS_METADATA,
    OPTIONAL_PROPERTY_DEPS_METADATA,
    PARAMTYPES_METADATA,
    PIPES_METADATA,
    PROPERTY_DEPS_METADATA,
    ROUTE_ARGS_METADATA,
    SELF_DECLARED_DEPS_METADATA,
} from '@nestjs/common/constants';
import {
    ApplicationConfig,
    ExternalContextCreator,
    HttpAdapterHost,
    INQUIRER,
    LazyModuleLoader,
    ModuleRef,
    ModulesContainer,
    REQUEST,
    Reflector,
    SerializedGraph,
} from '@nestjs/core';
import { DocumentTemplateModule } from '@lib/portal-lib/konstructor/document-template';
import { KonstructorAppModule } from '../app.module';
import { KonstructorModule } from '../konstructor.module';
import { OfferPdfModule } from '../offer-pdf/offer-pdf.module';
import { OfferWordModule } from '../offer-word/offer-word.module';
import { OfferWordWorkerModule } from '../offer-word/offer-word-worker.module';
import { InitSupplyModule } from '../supply/init-supply/init-supply.module';
import { GarantModule } from '@lib/garant/garant.module';
import { RegionController } from '@lib/garant/region/region.controller';
import { PortalRegionController } from '@lib/garant/region/portal-region/portal.region.controller';
import { ComplectController } from '@lib/garant/complect/complect.controller';
import { ContractController } from '@lib/garant/contract/contract.controller';
import { SupplyController } from '@lib/garant/supply/supply.controller';
import { InfoblockController } from '@lib/garant/infoblock/infoblock.controller';
import { InfogroupController } from '@lib/garant/infogroup/controllers/infogroup.controller';
import { AdminGarantPackageController } from '@lib/garant/package/controllers/package.admin.controller';
import { AdminGarantProfPriceController } from '@lib/garant/price/controllers/prof-price.admin.controller';
import { CatalogTableAdminController } from '@lib/garant/catalog-table/controllers/catalog-table.admin.controller';
import { CatalogSeedAdminController } from '@lib/garant/catalog-install/controllers/catalog-seed.admin.controller';
import { RegionAdminModule } from '@lib/garant/region/region.admin.module';
import { ComplectAdminModule } from '@lib/garant/complect/complect.admin.module';
import { ContractAdminModule } from '@lib/garant/contract/contract.admin.module';
import { SupplyAdminModule } from '@lib/garant/supply/supply.admin.module';
import { InfoblockAdminModule } from '@lib/garant/infoblock/infoblock.admin.module';
import { InfogroupAdminModule } from '@lib/garant/infogroup/infogroup.admin.module';
import { AdminGarantPackageModule } from '@lib/garant/package/package.admin.module';
import { AdminGarantProfPriceModule } from '@lib/garant/price/price.admin.module';
import { CatalogTableAdminModule } from '@lib/garant/catalog-table/catalog-table.admin.module';
import { CatalogSeedAdminModule } from '@lib/garant/catalog-install/catalog-install.admin.module';

/**
 * Статическая проверка DI-графа ВСЕГО приложения konstructor.
 *
 * Юнит-тесты сервисов работают на моках и забытый импорт модуля не видят:
 * приложение падает при старте на проде. Тест обходит граф от корневого
 * модуля (KonstructorAppModule) по метаданным декораторов, без подъёма Nest,
 * базы и Redis, и для каждого модуля, провайдера и контроллера проверяет,
 * что каждая зависимость конструктора доступна его модулю: это свой
 * провайдер, экспорт импортированного модуля (с учётом реэкспорта модулей)
 * или экспорт глобального модуля, достижимого от корня.
 *
 * Правила повторяют DependenciesScanner и Injector из @nestjs/core 11:
 *  - динамические модули ({ module, imports, providers, exports, global })
 *    складывают свои метаданные со статическими, forwardRef раскрывается;
 *  - токен провайдера-объекта равен provide, у фабрики проверяются токены
 *    inject (запись { token, optional } понимается), у useExisting
 *    проверяется целевой токен;
 *  - @Inject(token) заменяет тип параметра, @Optional() разрешает отсутствие,
 *    токены-строки сравниваются как строки;
 *  - сервисы, подвешенные на контроллеры и провайдеры через @UseGuards,
 *    @UseInterceptors, @UseFilters, @UsePipes и пайпы параметров, создаются
 *    в модуле хозяина, поэтому их зависимости проверяются там же;
 *  - экспорт модуля обязан быть его провайдером или импортируемым модулем,
 *    иначе Nest бросает UnknownExportException при старте;
 *  - undefined в imports/providers/controllers/exports или в типе параметра
 *    выдаёт циклический импорт файлов, и Nest падает на нём тоже.
 *
 * Отдельного корня воркера очередей нет: OfferWordWorkerModule подключён в
 * KonstructorAppModule и проверяется вместе со всем приложением. Отдельный
 * обход потерял бы глобальные модули корня и дал бы ложные срабатывания.
 *
 * Отдельные утверждения закрывают публичную поверхность: приложение
 * konstructor не регистрирует контроллеры справочников Гаранта (libs/garant).
 * Они пишут цены регионов портала, комплекты, поставки и договоры, а
 * глобального гарда авторизации в приложении нет. Контроллеры живут в
 * *AdminModule разделов Гаранта и подключаются только в apps/admin.
 *
 * Тест не ловит: зависимости, которые провайдер берёт у ModuleRef.get() в
 * рантайме, ошибки внутри фабрик, значения окружения, а также другие
 * приложения (admin и прочие), которые импортируют те же модули.
 */

type Ctor = new (...args: never[]) => unknown;

/**
 * Токены, доступные в любом модуле без импорта: их отдаёт сам Nest
 * (InternalCoreModule, @Global) и каждый модуль про себя.
 */
const BUILTIN_TOKENS = new Set<unknown>([
    // ModuleRef и ApplicationConfig регистрирует каждый модуль у себя
    ModuleRef,
    ApplicationConfig,
    // глобальный InternalCoreModule: Reflector (и его строковый алиас),
    // REQUEST и INQUIRER для провайдеров с областью запроса
    Reflector,
    'Reflector',
    REQUEST,
    INQUIRER,
    // провайдеры InternalCoreModule.register(...) из InternalCoreModuleFactory
    ExternalContextCreator,
    ModulesContainer,
    HttpAdapterHost,
    LazyModuleLoader,
    SerializedGraph,
]);

/**
 * Типы TypeScript, которые Nest не примет за токен: так выглядят
 * параметры-интерфейсы, объединения и примитивы без @Inject.
 */
const NON_TOKEN_TYPES: unknown[] = [
    Object,
    String,
    Number,
    Boolean,
    Array,
    Function,
    Symbol,
    BigInt,
    Promise,
    Map,
    Set,
    Date,
];

/** Метаданные, под которыми Nest хранит сервисы-надстройки контроллеров. */
const ENHANCER_KEYS: ReadonlyArray<readonly [string, string]> = [
    [GUARDS_METADATA, 'guard'],
    [INTERCEPTORS_METADATA, 'interceptor'],
    [EXCEPTION_FILTERS_METADATA, 'filter'],
    [PIPES_METADATA, 'pipe'],
];

type ModuleKey = 'imports' | 'providers' | 'controllers' | 'exports';

interface Dependency {
    token: unknown;
    optional: boolean;
    /** Где объявлена зависимость: «параметр 2», «свойство x», «inject[0]». */
    where: string;
}

/** Всё, что Nest создаёт в модуле и чьи зависимости разрешает. */
interface Unit {
    label: string;
    token: unknown;
    dependencies: Dependency[];
}

interface ModuleNode {
    label: string;
    cls: Ctor;
    global: boolean;
    imports: ModuleNode[];
    providerTokens: Set<unknown>;
    exportTokens: Set<unknown>;
    units: Unit[];
    problems: string[];
    providerCount: number;
    controllerCount: number;
    /** Классы контроллеров, которые регистрирует сам модуль. */
    controllers: Ctor[];
}

interface DiReport {
    /** Нарушения связывания, каждое отдельной строкой. */
    problems: string[];
    /** Классы с параметрами конструктора, у которых нет метаданных типов. */
    undecorated: string[];
    modules: string[];
    providerCount: number;
    controllerCount: number;
    /** Все классы контроллеров, зарегистрированные модулями графа. */
    controllerClasses: Ctor[];
    /** Сколько зависимостей конструкторов и фабрик проверено. */
    dependencyCount: number;
}

interface CustomProvider {
    provide: unknown;
    useClass?: unknown;
    useFactory?: unknown;
    useExisting?: unknown;
    inject?: unknown;
}

// Метаданные Reflect приходят как any; сразу сужаем до unknown.
const metadata = (key: string, target: object, property?: string): unknown =>
    property === undefined
        ? Reflect.getMetadata(key, target)
        : Reflect.getMetadata(key, target, property);

const asList = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : [];

const metadataList = (key: string, target: object): unknown[] =>
    asList(metadata(key, target));

/** Функция или класс: Ctor описывает и то и другое для чтения метаданных. */
const isFunction = (value: unknown): value is Ctor =>
    typeof value === 'function';

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
    typeof value === 'object' && value !== null;

const isDynamicModule = (value: unknown): value is DynamicModule =>
    isRecord(value) && isFunction(value.module);

const isForwardRef = (value: unknown): value is { forwardRef: () => unknown } =>
    isRecord(value) && typeof value.forwardRef === 'function';

const isCustomProvider = (value: unknown): value is CustomProvider =>
    isRecord(value) && value.provide !== undefined && value.provide !== null;

const unwrapForwardRef = (token: unknown): unknown =>
    isForwardRef(token) ? token.forwardRef() : token;

const tokenName = (token: unknown): string => {
    if (isFunction(token)) return token.name || '(анонимный класс)';
    if (typeof token === 'string') return `'${token}'`;
    return inspect(token, { depth: 0 });
};

const dynamicList = (
    dynamic: DynamicModule | undefined,
    key: ModuleKey,
): unknown[] => asList(dynamic?.[key]);

/** Методы класса вместе с унаследованными; переопределённый метод берётся из потомка. */
const methodsOf = (host: Ctor): Array<{ name: string; fn: Ctor }> => {
    const methods = new Map<string, Ctor>();
    let prototype: unknown = host.prototype;
    while (isRecord(prototype) && prototype !== Object.prototype) {
        for (const name of Object.getOwnPropertyNames(prototype)) {
            if (name === 'constructor' || methods.has(name)) continue;
            const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
            if (descriptor && isFunction(descriptor.value)) {
                methods.set(name, descriptor.value);
            }
        }
        prototype = Object.getPrototypeOf(prototype);
    }
    return [...methods].map(([name, fn]) => ({ name, fn }));
};

/** Классы-надстройки (guard, interceptor, filter, pipe) контроллера или провайдера. */
const enhancersOf = (host: Ctor): Array<{ kind: string; cls: Ctor }> => {
    const found: Array<{ kind: string; cls: Ctor }> = [];
    const methods = methodsOf(host);
    for (const [key, kind] of ENHANCER_KEYS) {
        const items = [
            ...metadataList(key, host),
            ...methods.flatMap(({ fn }) => metadataList(key, fn)),
        ];
        for (const item of items) {
            if (isFunction(item)) found.push({ kind, cls: item });
        }
    }
    for (const { name } of methods) {
        const routeArgs = metadata(ROUTE_ARGS_METADATA, host, name);
        if (!isRecord(routeArgs)) continue;
        for (const arg of Object.values(routeArgs)) {
            if (!isRecord(arg)) continue;
            for (const pipe of asList(arg.pipes)) {
                if (isFunction(pipe)) found.push({ kind: 'pipe', cls: pipe });
            }
        }
    }
    return found;
};

interface ClassInfo {
    dependencies: Dependency[];
    /** Параметры конструктора есть, метаданных типов нет (класс без декоратора). */
    undecorated: boolean;
}

/** Зависимости класса так, как их собирает Injector: типы, @Inject, @Optional. */
const describeClass = (cls: Ctor): ClassInfo => {
    const params = [...metadataList(PARAMTYPES_METADATA, cls)];
    for (const item of metadataList(SELF_DECLARED_DEPS_METADATA, cls)) {
        if (isRecord(item) && typeof item.index === 'number') {
            params[item.index] = item.param;
        }
    }
    const optionalParams = new Set(metadataList(OPTIONAL_DEPS_METADATA, cls));
    const dependencies: Dependency[] = [];
    for (let index = 0; index < params.length; index += 1) {
        dependencies.push({
            token: unwrapForwardRef(params[index]),
            optional: optionalParams.has(index),
            where: `параметр ${index + 1}`,
        });
    }
    const optionalKeys = new Set(
        metadataList(OPTIONAL_PROPERTY_DEPS_METADATA, cls),
    );
    for (const item of metadataList(PROPERTY_DEPS_METADATA, cls)) {
        if (!isRecord(item)) continue;
        dependencies.push({
            token: unwrapForwardRef(item.type),
            optional: optionalKeys.has(item.key),
            where: `свойство ${String(item.key)}`,
        });
    }
    // Свои метаданные: у потомка с собственным конструктором без декоратора
    // Nest прочитал бы метаданные родителя, и параметры потомка пропали бы.
    const ownParamTypes: unknown = Reflect.getOwnMetadata(
        PARAMTYPES_METADATA,
        cls,
    );
    return {
        dependencies,
        undecorated: ownParamTypes === undefined && cls.length > 0,
    };
};

/** Зависимость из inject фабрики: токен или { token, optional }. */
const factoryDependency = (item: unknown, index: number): Dependency => {
    const where = `inject[${index}]`;
    if (
        isRecord(item) &&
        item.token !== undefined &&
        item.optional !== undefined
    ) {
        return {
            token: unwrapForwardRef(item.token),
            optional: Boolean(item.optional),
            where,
        };
    }
    return { token: unwrapForwardRef(item), optional: false, where };
};

/** Токен экспорта: provide, класс динамического модуля, строка, символ или класс. */
const exportedToken = (entry: unknown): unknown => {
    if (isForwardRef(entry)) return exportedToken(entry.forwardRef());
    if (isCustomProvider(entry)) return entry.provide;
    if (isDynamicModule(entry)) return entry.module;
    return entry;
};

const unwrapModule = (entry: unknown): Ctor | DynamicModule | undefined => {
    const unwrapped = isForwardRef(entry) ? entry.forwardRef() : entry;
    return isFunction(unwrapped) || isDynamicModule(unwrapped)
        ? unwrapped
        : undefined;
};

const buildGraph = async (
    root: Ctor,
): Promise<{
    nodes: ModuleNode[];
    undecorated: Set<string>;
}> => {
    const nodes = new Map<Ctor | DynamicModule, ModuleNode>();
    const undecorated = new Set<string>();

    const visit = async (entry: Ctor | DynamicModule): Promise<ModuleNode> => {
        const known = nodes.get(entry);
        if (known) return known;

        const cls = isFunction(entry) ? entry : entry.module;
        const dynamic = isFunction(entry) ? undefined : entry;
        const node: ModuleNode = {
            label: dynamic ? `${cls.name} (динамический)` : cls.name,
            cls,
            global:
                dynamic?.global === true ||
                Boolean(metadata(GLOBAL_MODULE_METADATA, cls)),
            imports: [],
            providerTokens: new Set<unknown>([cls]),
            exportTokens: new Set<unknown>(),
            units: [],
            problems: [],
            providerCount: 0,
            controllerCount: 0,
            controllers: [],
        };
        nodes.set(entry, node);

        const pick = (key: ModuleKey): unknown[] => [
            ...metadataList(key, cls),
            ...dynamicList(dynamic, key),
        ];
        const addClassUnit = (
            label: string,
            token: unknown,
            target: Ctor,
        ): void => {
            const info = describeClass(target);
            if (info.undecorated) {
                undecorated.add(
                    `${node.label}: ${target.name} (параметров конструктора: ${target.length})`,
                );
            }
            node.units.push({ label, token, dependencies: info.dependencies });
        };
        const enhancerClasses = new Set<Ctor>();
        const addEnhancers = (host: Ctor): void => {
            for (const { kind, cls: enhancer } of enhancersOf(host)) {
                if (enhancerClasses.has(enhancer)) continue;
                enhancerClasses.add(enhancer);
                addClassUnit(
                    `${enhancer.name} (${kind} в ${host.name})`,
                    enhancer,
                    enhancer,
                );
            }
        };

        const imports = pick('imports');
        for (let index = 0; index < imports.length; index += 1) {
            // Nest ждёт асинхронные динамические модули (ConfigModule.forRoot
            // возвращает Promise) перед сканированием, тест делает так же.
            let raw: unknown = imports[index];
            if (raw instanceof Promise) {
                try {
                    raw = await raw;
                } catch (error) {
                    node.problems.push(
                        `imports[${index}]: асинхронный модуль завершился ошибкой (${inspect(error, { depth: 0 })})`,
                    );
                    continue;
                }
            }
            const resolved = unwrapModule(raw);
            if (!resolved) {
                node.problems.push(
                    `imports[${index}] = ${inspect(raw, { depth: 0 })}: модуль не определён (циклический импорт файлов, нужен forwardRef)`,
                );
                continue;
            }
            const importedClass = isFunction(resolved)
                ? resolved
                : resolved.module;
            const isEnhancerLike = [
                INJECTABLE_WATERMARK,
                CONTROLLER_WATERMARK,
                CATCH_WATERMARK,
            ].some(watermark => Boolean(metadata(watermark, importedClass)));
            if (isEnhancerLike) {
                node.problems.push(
                    `imports[${index}] = ${importedClass.name}: это сервис, контроллер или фильтр, модулем он не считается`,
                );
                continue;
            }
            node.imports.push(await visit(resolved));
        }

        // Nest создаёт и сам класс модуля: его конструктор тоже получает зависимости.
        addClassUnit(`${cls.name} (конструктор модуля)`, cls, cls);

        pick('providers').forEach((raw, index) => {
            node.providerCount += 1;
            if (isFunction(raw)) {
                node.providerTokens.add(raw);
                addClassUnit(raw.name, raw, raw);
                addEnhancers(raw);
                return;
            }
            if (!isCustomProvider(raw)) {
                node.problems.push(
                    `providers[${index}] = ${inspect(raw, { depth: 0 })}: недопустимый провайдер (циклический импорт файлов?)`,
                );
                return;
            }
            const name = tokenName(raw.provide);
            if (raw.useClass !== undefined) {
                if (!isFunction(raw.useClass)) {
                    node.problems.push(`${name}: useClass без класса`);
                    return;
                }
                node.providerTokens.add(raw.provide);
                addClassUnit(
                    `${name} (useClass ${raw.useClass.name})`,
                    raw.provide,
                    raw.useClass,
                );
            } else if (Object.prototype.hasOwnProperty.call(raw, 'useValue')) {
                node.providerTokens.add(raw.provide);
            } else if (raw.useFactory !== undefined) {
                node.providerTokens.add(raw.provide);
                node.units.push({
                    label: `${name} (useFactory)`,
                    token: raw.provide,
                    dependencies: asList(raw.inject).map(factoryDependency),
                });
            } else if (raw.useExisting !== undefined) {
                node.providerTokens.add(raw.provide);
                node.units.push({
                    label: `${name} (useExisting)`,
                    token: raw.provide,
                    dependencies: [
                        {
                            token: raw.useExisting,
                            optional: false,
                            where: 'useExisting',
                        },
                    ],
                });
            } else {
                node.problems.push(
                    `${name}: у провайдера нет useClass, useValue, useFactory или useExisting`,
                );
            }
        });

        pick('controllers').forEach((raw, index) => {
            node.controllerCount += 1;
            if (!isFunction(raw)) {
                node.problems.push(
                    `controllers[${index}] = ${inspect(raw, { depth: 0 })}: контроллер не определён (циклический импорт файлов?)`,
                );
                return;
            }
            node.controllers.push(raw);
            addClassUnit(raw.name, raw, raw);
            addEnhancers(raw);
        });

        const importedClasses = new Set<unknown>(node.imports.map(i => i.cls));
        pick('exports').forEach((raw, index) => {
            const token = exportedToken(raw);
            if (token === undefined || token === null) {
                node.problems.push(
                    `exports[${index}] не определён (циклический импорт файлов)`,
                );
                return;
            }
            node.exportTokens.add(token);
            if (
                !node.providerTokens.has(token) &&
                !importedClasses.has(token)
            ) {
                node.problems.push(
                    `экспортирует ${tokenName(token)}, которого нет ни среди его провайдеров, ни среди импортируемых модулей`,
                );
            }
        });

        return node;
    };

    await visit(root);
    return { nodes: [...nodes.values()], undecorated };
};

/**
 * Модуль отдаёт токен наружу: экспортирует его и держит у себя как
 * провайдер, либо реэкспортирует импортируемый модуль, который так делает.
 */
const exposes = (
    module: ModuleNode,
    token: unknown,
    visited: Set<ModuleNode>,
): boolean => {
    if (visited.has(module)) return false;
    visited.add(module);
    if (module.exportTokens.has(token) && module.providerTokens.has(token)) {
        return true;
    }
    return module.imports.some(
        child =>
            module.exportTokens.has(child.cls) &&
            exposes(child, token, visited),
    );
};

const isAvailable = (
    node: ModuleNode,
    token: unknown,
    globals: ModuleNode[],
): boolean =>
    BUILTIN_TOKENS.has(token) ||
    node.providerTokens.has(token) ||
    [...node.imports, ...globals.filter(item => item !== node)].some(item =>
        exposes(item, token, new Set<ModuleNode>()),
    );

const analyseDiGraph = async (root: Ctor): Promise<DiReport> => {
    const { nodes, undecorated } = await buildGraph(root);
    const globals = nodes.filter(node => node.global);
    const problems = new Set<string>();
    let dependencyCount = 0;

    for (const node of nodes) {
        for (const problem of node.problems) {
            problems.add(`${node.label}: ${problem}`);
        }
        for (const unit of node.units) {
            for (const dependency of unit.dependencies) {
                if (dependency.optional) continue;
                dependencyCount += 1;
                const prefix = `${node.label}: ${unit.label} → `;
                if (dependency.token === undefined) {
                    problems.add(
                        `${prefix}? (${dependency.where}: тип не определён, циклический импорт файлов; нужен @Inject(forwardRef(...)))`,
                    );
                } else if (dependency.token === unit.token) {
                    problems.add(
                        `${prefix}${tokenName(dependency.token)} (зависит от самого себя)`,
                    );
                } else if (!isAvailable(node, dependency.token, globals)) {
                    const hint = NON_TOKEN_TYPES.includes(dependency.token)
                        ? ` (${dependency.where}: тип не годится в токены, нужен @Inject(токен))`
                        : '';
                    problems.add(
                        `${prefix}${tokenName(dependency.token)}${hint}`,
                    );
                }
            }
        }
    }

    return {
        problems: [...problems].sort(),
        undecorated: [...undecorated].sort(),
        modules: nodes.map(node => node.label),
        providerCount: nodes.reduce((sum, node) => sum + node.providerCount, 0),
        controllerCount: nodes.reduce(
            (sum, node) => sum + node.controllerCount,
            0,
        ),
        controllerClasses: [
            ...new Set(nodes.flatMap(node => node.controllers)),
        ],
        dependencyCount,
    };
};

/**
 * Контроллеры справочников Гаранта (libs/garant): ручки правки цен, регионов
 * портала, комплектов, поставок, договоров, инфоблоков и пакетов. Публичное
 * приложение konstructor их не регистрирует. Список явный: новый контроллер
 * Гаранта дописывают сюда.
 */
const GARANT_CONTROLLERS: ReadonlyArray<Ctor> = [
    RegionController,
    PortalRegionController,
    ComplectController,
    ContractController,
    SupplyController,
    InfoblockController,
    InfogroupController,
    AdminGarantPackageController,
    AdminGarantProfPriceController,
    CatalogTableAdminController,
    CatalogSeedAdminController,
];

/** Модули Гаранта, которые несут контроллеры: konstructor их не импортирует. */
const GARANT_ADMIN_MODULES: ReadonlyArray<Ctor> = [
    RegionAdminModule,
    ComplectAdminModule,
    ContractAdminModule,
    SupplyAdminModule,
    InfoblockAdminModule,
    InfogroupAdminModule,
    AdminGarantPackageModule,
    AdminGarantProfPriceModule,
    CatalogTableAdminModule,
    CatalogSeedAdminModule,
];

describe('DI-граф приложения konstructor', () => {
    let report: DiReport;

    beforeAll(async () => {
        report = await analyseDiGraph(KonstructorAppModule);
        if (report.undecorated.length > 0) {
            console.warn(
                [
                    'DI-граф konstructor: классы с параметрами конструктора и без метаданных типов (нет декоратора), зависимости этих классов не проверены:',
                    ...report.undecorated.map(line => `  - ${line}`),
                ].join('\n'),
            );
        }
        console.info(
            `DI-граф konstructor: корень ${KonstructorAppModule.name}, модулей ${report.modules.length}, провайдеров ${report.providerCount}, контроллеров ${report.controllerCount}, проверено зависимостей ${report.dependencyCount}`,
        );
    });

    it('обход дошёл до модулей, чьё связывание менялось, и до воркера очередей', () => {
        const reached = new Set(report.modules);
        for (const module of [
            KonstructorAppModule,
            KonstructorModule,
            OfferWordModule,
            OfferWordWorkerModule,
            OfferPdfModule,
            InitSupplyModule,
            DocumentTemplateModule,
        ]) {
            expect(reached).toContain(module.name);
        }
    });

    it('обход полный: проверены сотни зависимостей конструкторов', () => {
        expect(report.modules.length).toBeGreaterThan(30);
        expect(report.providerCount).toBeGreaterThan(200);
        expect(report.controllerCount).toBeGreaterThan(10);
        expect(report.dependencyCount).toBeGreaterThan(300);
    });

    it('каждая зависимость провайдера и контроллера доступна своему модулю', () => {
        expect(report.problems).toEqual([]);
    });

    it('контроллеры справочников Гаранта в приложении не зарегистрированы', () => {
        const registered = new Set<unknown>(report.controllerClasses);
        const leaked = GARANT_CONTROLLERS.filter(controller =>
            registered.has(controller),
        ).map(controller => controller.name);
        expect(leaked).toEqual([]);
    });

    it('модули Гаранта с контроллерами в граф приложения не входят', () => {
        const reached = new Set(report.modules);
        const leaked = GARANT_ADMIN_MODULES.filter(module =>
            reached.has(module.name),
        ).map(module => module.name);
        expect(leaked).toEqual([]);
    });

    it('утверждения про Гарант содержательны: GarantModule в графе, список состоит из настоящих контроллеров и модулей с контроллерами', () => {
        expect(new Set(report.modules)).toContain(GarantModule.name);
        expect(new Set(GARANT_CONTROLLERS).size).toBe(
            GARANT_CONTROLLERS.length,
        );
        for (const controller of GARANT_CONTROLLERS) {
            expect(controller).toBeDefined();
            expect(Reflect.getMetadata(CONTROLLER_WATERMARK, controller)).toBe(
                true,
            );
        }
        for (const module of GARANT_ADMIN_MODULES) {
            expect(module).toBeDefined();
            expect(
                asList(Reflect.getMetadata('controllers', module)).length,
            ).toBeGreaterThan(0);
        }
    });
});

/*
 * Проверка самого анализатора на синтетических модулях: ошибка в анализаторе
 * молча пропускала бы настоящие провалы связывания.
 */
describe('анализатор DI-графа: чувствительность на синтетических модулях', () => {
    @Injectable()
    class Leaf {}

    @Injectable()
    class NeedsLeaf {
        constructor(readonly leaf: Leaf) {}
    }

    @Injectable()
    class NeedsToken {
        constructor(@Inject('TOKEN') readonly value: string) {}
    }

    @Injectable()
    class NeedsOptionalToken {
        constructor(@Optional() @Inject('MISSING') readonly value?: string) {}
    }

    @Injectable()
    class NeedsString {
        constructor(readonly value: string) {}
    }

    @Injectable()
    class NeedsLazyLeaf {
        constructor(@Inject(forwardRef(() => Leaf)) readonly leaf: Leaf) {}
    }

    class Undecorated {
        constructor(readonly leaf: Leaf) {}
    }

    @Injectable()
    class NeedsLeafGuard implements CanActivate {
        constructor(readonly leaf: Leaf) {}
        canActivate(): boolean {
            return true;
        }
    }

    @Controller('guarded')
    @UseGuards(NeedsLeafGuard)
    class GuardedController {}

    @Controller('plain')
    class NeedsLeafController {
        constructor(readonly leaf: Leaf) {}
    }

    /** Модуль из метаданных, собранный в рантайме, с читаемым именем в сообщениях. */
    const moduleOf = (
        name: string,
        metadataByKey: Partial<Record<ModuleKey, unknown[]>>,
    ): Ctor => {
        class SyntheticModule {}
        Object.defineProperty(SyntheticModule, 'name', { value: name });
        for (const [key, value] of Object.entries(metadataByKey)) {
            Reflect.defineMetadata(key, value, SyntheticModule);
        }
        return SyntheticModule;
    };

    const rootOf = (...imports: unknown[]): Ctor =>
        moduleOf('Root', { imports });

    const LeafModule = moduleOf('LeafModule', {
        providers: [Leaf],
        exports: [Leaf],
    });
    const HiddenLeafModule = moduleOf('HiddenLeafModule', {
        providers: [Leaf],
    });
    const GlobalLeafModule = moduleOf('GlobalLeafModule', {
        providers: [Leaf],
        exports: [Leaf],
    });
    Global()(GlobalLeafModule);

    it('верно собранный граф проходит', async () => {
        const consumer = moduleOf('ConsumerModule', {
            imports: [LeafModule],
            providers: [NeedsLeaf],
            controllers: [NeedsLeafController],
        });
        const report = await analyseDiGraph(rootOf(consumer));
        expect(report.problems).toEqual([]);
        expect(report.dependencyCount).toBe(2);
    });

    it('забытый импорт модуля называет модуль, провайдер и зависимость', async () => {
        const consumer = moduleOf('ConsumerModule', { providers: [NeedsLeaf] });
        expect((await analyseDiGraph(rootOf(consumer))).problems).toEqual([
            'ConsumerModule: NeedsLeaf → Leaf',
        ]);
    });

    it('провайдер импортируемого модуля без экспорта недоступен', async () => {
        const consumer = moduleOf('ConsumerModule', {
            imports: [HiddenLeafModule],
            providers: [NeedsLeaf],
        });
        expect((await analyseDiGraph(rootOf(consumer))).problems).toEqual([
            'ConsumerModule: NeedsLeaf → Leaf',
        ]);
    });

    it('реэкспорт модуля открывает его провайдеры, без реэкспорта они закрыты', async () => {
        const reexporting = moduleOf('ReexportingModule', {
            imports: [LeafModule],
            exports: [LeafModule],
        });
        const keeping = moduleOf('KeepingModule', { imports: [LeafModule] });
        const throughReexport = moduleOf('ThroughReexportModule', {
            imports: [reexporting],
            providers: [NeedsLeaf],
        });
        const throughKeeping = moduleOf('ThroughKeepingModule', {
            imports: [keeping],
            providers: [NeedsLeaf],
        });
        expect(
            (await analyseDiGraph(rootOf(throughReexport))).problems,
        ).toEqual([]);
        expect((await analyseDiGraph(rootOf(throughKeeping))).problems).toEqual(
            ['ThroughKeepingModule: NeedsLeaf → Leaf'],
        );
    });

    it('глобальный модуль виден всем, если достижим от корня', async () => {
        const consumer = moduleOf('ConsumerModule', { providers: [NeedsLeaf] });
        expect(
            (await analyseDiGraph(rootOf(GlobalLeafModule, consumer))).problems,
        ).toEqual([]);
        // глобальный модуль вне графа Nest не сканирует
        expect((await analyseDiGraph(rootOf(consumer))).problems).toEqual([
            'ConsumerModule: NeedsLeaf → Leaf',
        ]);
    });

    it('динамический модуль: global: true и собственные метаданные складываются со статическими', async () => {
        const consumer = moduleOf('ConsumerModule', { providers: [NeedsLeaf] });
        const dynamicGlobal: DynamicModule = {
            module: LeafModule,
            global: true,
        };
        expect(
            (await analyseDiGraph(rootOf(dynamicGlobal, consumer))).problems,
        ).toEqual([]);

        const host = moduleOf('Host', {});
        const completeHost: DynamicModule = {
            module: host,
            imports: [LeafModule],
            providers: [NeedsLeaf],
        };
        expect((await analyseDiGraph(rootOf(completeHost))).problems).toEqual(
            [],
        );
        const brokenHost: DynamicModule = {
            module: host,
            providers: [NeedsLeaf],
        };
        expect((await analyseDiGraph(rootOf(brokenHost))).problems).toEqual([
            'Host (динамический): NeedsLeaf → Leaf',
        ]);
    });

    it('асинхронный динамический модуль (как ConfigModule.forRoot) раскрывается, отклонённый Promise называется в сообщении', async () => {
        const consumer = moduleOf('ConsumerModule', { providers: [NeedsLeaf] });
        const asyncGlobal = Promise.resolve<DynamicModule>({
            module: LeafModule,
            global: true,
        });
        expect(
            (await analyseDiGraph(rootOf(asyncGlobal, consumer))).problems,
        ).toEqual([]);

        const rejected = Promise.reject(new Error('нет файла .env'));
        const report = await analyseDiGraph(rootOf(rejected));
        expect(report.problems).toHaveLength(1);
        expect(report.problems[0]).toContain('Root: imports[0]');
        expect(report.problems[0]).toContain('нет файла .env');
    });

    it('токены-строки: provide закрывает @Inject, пропажа токена видна, @Optional разрешает отсутствие', async () => {
        const provided = moduleOf('ProvidedModule', {
            providers: [NeedsToken, { provide: 'TOKEN', useValue: 'x' }],
        });
        const missing = moduleOf('MissingModule', { providers: [NeedsToken] });
        const optional = moduleOf('OptionalModule', {
            providers: [NeedsOptionalToken],
        });
        expect((await analyseDiGraph(rootOf(provided))).problems).toEqual([]);
        expect((await analyseDiGraph(rootOf(missing))).problems).toEqual([
            "MissingModule: NeedsToken → 'TOKEN'",
        ]);
        expect((await analyseDiGraph(rootOf(optional))).problems).toEqual([]);
    });

    it('фабрика, useExisting и useClass проверяют свои токены', async () => {
        const broken = moduleOf('BrokenModule', {
            providers: [
                {
                    provide: 'FROM_LEAF',
                    useFactory: (leaf: Leaf) => leaf,
                    inject: [Leaf, { token: 'OPTIONAL', optional: true }],
                },
                { provide: 'ALIAS', useExisting: Leaf },
                { provide: 'KLASS', useClass: NeedsLeaf },
            ],
        });
        expect((await analyseDiGraph(rootOf(broken))).problems).toEqual([
            "BrokenModule: 'ALIAS' (useExisting) → Leaf",
            "BrokenModule: 'FROM_LEAF' (useFactory) → Leaf",
            "BrokenModule: 'KLASS' (useClass NeedsLeaf) → Leaf",
        ]);
        const complete = moduleOf('CompleteModule', {
            imports: [LeafModule],
            providers: [
                {
                    provide: 'FROM_LEAF',
                    useFactory: (leaf: Leaf) => leaf,
                    inject: [Leaf],
                },
                { provide: 'ALIAS', useExisting: Leaf },
                { provide: 'KLASS', useClass: NeedsLeaf },
            ],
        });
        expect((await analyseDiGraph(rootOf(complete))).problems).toEqual([]);
    });

    it('forwardRef в imports и в @Inject раскрывается, цикл модулей не зацикливает обход', async () => {
        const first = moduleOf('FirstModule', { providers: [NeedsLazyLeaf] });
        const second = moduleOf('SecondModule', {});
        Reflect.defineMetadata('imports', [forwardRef(() => second)], first);
        Reflect.defineMetadata('imports', [forwardRef(() => first)], second);
        expect((await analyseDiGraph(rootOf(first))).problems).toEqual([
            'FirstModule: NeedsLazyLeaf → Leaf',
        ]);
        Reflect.defineMetadata(
            'imports',
            [forwardRef(() => second), LeafModule],
            first,
        );
        expect((await analyseDiGraph(rootOf(first))).problems).toEqual([]);
    });

    it('сервисы @UseGuards проверяются в модуле контроллера', async () => {
        const guarded = moduleOf('GuardedModule', {
            controllers: [GuardedController],
        });
        expect((await analyseDiGraph(rootOf(guarded))).problems).toEqual([
            'GuardedModule: NeedsLeafGuard (guard в GuardedController) → Leaf',
        ]);
    });

    it('зависимости контроллера проверяются так же, как провайдера', async () => {
        const controllerModule = moduleOf('ControllerModule', {
            controllers: [NeedsLeafController],
        });
        expect(
            (await analyseDiGraph(rootOf(controllerModule))).problems,
        ).toEqual(['ControllerModule: NeedsLeafController → Leaf']);
    });

    it('отчёт называет классы контроллеров всех модулей графа, в том числе вложенных', async () => {
        const nested = moduleOf('NestedModule', {
            imports: [LeafModule],
            controllers: [NeedsLeafController],
        });
        const outer = moduleOf('OuterModule', {
            imports: [nested],
            controllers: [GuardedController],
            providers: [NeedsLeafGuard],
        });
        const report = await analyseDiGraph(rootOf(outer));
        expect(new Set(report.controllerClasses)).toEqual(
            new Set<unknown>([NeedsLeafController, GuardedController]),
        );
        const clean = await analyseDiGraph(rootOf(LeafModule));
        expect(clean.controllerClasses).toEqual([]);
    });

    it('параметр без токена (примитив или интерфейс) получает подсказку про @Inject', async () => {
        const stringModule = moduleOf('StringModule', {
            providers: [NeedsString],
        });
        expect((await analyseDiGraph(rootOf(stringModule))).problems).toEqual([
            'StringModule: NeedsString → String (параметр 1: тип не годится в токены, нужен @Inject(токен))',
        ]);
    });

    it('тип параметра undefined (циклический импорт файлов) считается ошибкой', async () => {
        class Broken {}
        Reflect.defineMetadata('design:paramtypes', [undefined], Broken);
        const brokenModule = moduleOf('BrokenModule', { providers: [Broken] });
        expect((await analyseDiGraph(rootOf(brokenModule))).problems).toEqual([
            'BrokenModule: Broken → ? (параметр 1: тип не определён, циклический импорт файлов; нужен @Inject(forwardRef(...)))',
        ]);
    });

    it('undefined в imports, providers и exports называется в сообщении', async () => {
        const module = moduleOf('UndefinedModule', {
            imports: [undefined],
            providers: [undefined],
            exports: [undefined],
        });
        const text = (await analyseDiGraph(rootOf(module))).problems.join('\n');
        expect(text).toContain('UndefinedModule: imports[0]');
        expect(text).toContain('UndefinedModule: providers[0]');
        expect(text).toContain('UndefinedModule: exports[0]');
    });

    it('экспорт токена, которого модуль не держит, и сервис в imports — ошибки старта Nest', async () => {
        const exporting = moduleOf('ExportingModule', { exports: [Leaf] });
        expect((await analyseDiGraph(rootOf(exporting))).problems).toEqual([
            'ExportingModule: экспортирует Leaf, которого нет ни среди его провайдеров, ни среди импортируемых модулей',
        ]);
        const serviceAsModule = moduleOf('ServiceAsModule', {
            imports: [Leaf],
        });
        expect(
            (await analyseDiGraph(rootOf(serviceAsModule))).problems,
        ).toEqual([
            'ServiceAsModule: imports[0] = Leaf: это сервис, контроллер или фильтр, модулем он не считается',
        ]);
    });

    it('класс без декоратора с параметрами конструктора попадает в список предупреждений', async () => {
        const bare = moduleOf('BareModule', {
            imports: [LeafModule],
            providers: [Undecorated],
        });
        const report = await analyseDiGraph(rootOf(bare));
        expect(report.problems).toEqual([]);
        expect(report.undecorated).toEqual([
            'BareModule: Undecorated (параметров конструктора: 1)',
        ]);
    });
});
