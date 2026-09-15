import 'reflect-metadata';
import { DealAuditModule } from '../deal-audit.module';

/**
 * Статическая проверка DI-графа модуля аудита: каждая зависимость
 * конструктора провайдера и контроллера обязана быть доступна в модуле
 * или в экспортах его импортов.
 *
 * ЗАЧЕМ: юнит-тесты работают на моках, поэтому забытый импорт модуля
 * виден только при старте приложения — то есть уже в проде (боевой
 * случай 27.08.2026: event-sales не поднялся, 502; и он же 26.08.2026 в
 * реанимации отказников — забытые RedisModule/PortalAppSettingsModule).
 */

type Ctor = new (...args: never[]) => unknown;

const NEST_MODULE_KEYS = ['imports', 'providers', 'exports', 'controllers'];

const metaOf = (module: Ctor, key: string): unknown[] =>
    (Reflect.getMetadata(key, module) as unknown[] | undefined) ?? [];

const ctorsOf = (module: Ctor, key: string): Ctor[] =>
    metaOf(module, key).filter(
        (item): item is Ctor => typeof item === 'function',
    );

function exportsOf(module: Ctor, seen = new Set<Ctor>()): Set<Ctor> {
    const result = new Set<Ctor>();
    if (seen.has(module)) return result;
    seen.add(module);
    for (const item of ctorsOf(module, 'exports')) {
        // Реэкспорт модуля: у модуля есть любая из метадат Nest.
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

describe('DI-граф DealAuditModule (event-sales)', () => {
    it('все зависимости провайдеров и контроллеров доступны в модуле', () => {
        const available = availableIn(DealAuditModule);
        const missing: string[] = [];
        const targets = [
            ...ctorsOf(DealAuditModule, 'providers'),
            ...ctorsOf(DealAuditModule, 'controllers'),
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
