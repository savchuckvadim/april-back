import 'reflect-metadata';
import { EventReportDeferredModule } from '../event-report-deferred.module';

/**
 * Статическая проверка DI-графа модуля досылки: каждая зависимость
 * конструктора провайдера И КОНТРОЛЛЕРА обязана быть доступна в модуле
 * либо в экспортах его импортов.
 *
 * ЗАЧЕМ ИМЕННО ЗДЕСЬ: модуль сознательно объявляет своими провайдерами два
 * сервиса чужого модуля (`EventReportInitService`,
 * `QuestionnaireSmartContextLoader`) — `EventReportModule` их не
 * экспортирует, а дописывать ему `exports` нельзя (существующий flow не
 * трогается ни строкой). Такая раскладка легко разъезжается: у обоих
 * сервисов есть свои конструкторные зависимости, и забытый импорт виден
 * только при старте приложения — то есть уже в проде (боевой случай
 * 27.08.2026: event-sales не поднялся, 502).
 *
 * Техника — та же, что в `call-report-module-di.spec`: читаем метадату Nest
 * без поднятия приложения (коннекты к Redis/БД не нужны).
 */

type Ctor = new (...args: never[]) => unknown;

const metaList = (module: Ctor, key: string): unknown[] =>
    (Reflect.getMetadata(key, module) as unknown[] | undefined) ?? [];

const ctorsOf = (module: Ctor, key: string): Ctor[] =>
    metaList(module, key).filter(
        (item): item is Ctor => typeof item === 'function',
    );

/** Есть метадата Nest — это модуль, а не сервис. */
const isModule = (candidate: Ctor): boolean =>
    ['imports', 'providers', 'exports', 'controllers'].some(
        key => Reflect.getMetadata(key, candidate) !== undefined,
    );

function exportsOf(module: Ctor, seen = new Set<Ctor>()): Set<Ctor> {
    const result = new Set<Ctor>();
    if (seen.has(module)) return result;
    seen.add(module);
    for (const item of ctorsOf(module, 'exports')) {
        if (isModule(item)) {
            for (const nested of exportsOf(item, seen)) result.add(nested);
            continue;
        }
        result.add(item);
    }
    return result;
}

function availableIn(module: Ctor): Set<Ctor> {
    const available = new Set<Ctor>(ctorsOf(module, 'providers'));
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
            typeof param === 'function' &&
            ![Object, String, Number, Boolean, Array, Function].includes(
                param as never,
            ),
    );
}

describe('DI-граф EventReportDeferredModule', () => {
    it('все зависимости провайдеров и контроллера доступны в модуле', () => {
        const available = availableIn(EventReportDeferredModule);
        const missing: string[] = [];
        const targets = [
            ...ctorsOf(EventReportDeferredModule, 'providers'),
            ...ctorsOf(EventReportDeferredModule, 'controllers'),
        ];

        for (const target of targets) {
            for (const dependency of dependenciesOf(target)) {
                if (!available.has(dependency)) {
                    missing.push(`${target.name} → ${dependency.name}`);
                }
            }
        }

        expect(missing).toEqual([]);
    });
});
