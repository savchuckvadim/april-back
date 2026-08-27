import 'reflect-metadata';
import { CallReportModule } from '../call-report.module';

/**
 * Статическая проверка DI-графа модуля конвейера: каждая зависимость
 * конструктора провайдера обязана быть доступна в модуле или в экспортах
 * его импортов.
 *
 * ЗАЧЕМ: юнит-тесты сервисов работают на моках, поэтому забытый импорт
 * модуля виден только при старте приложения — то есть уже в проде
 * (боевой случай 27.08.2026: event-sales не поднялся, 502 на проде).
 */

type Ctor = new (...args: never[]) => unknown;

function providersOf(module: Ctor): Ctor[] {
    const providers =
        (Reflect.getMetadata('providers', module) as unknown[] | undefined) ??
        [];
    return providers.filter(
        (provider): provider is Ctor => typeof provider === 'function',
    );
}

function exportsOf(module: Ctor, seen = new Set<Ctor>()): Set<Ctor> {
    const result = new Set<Ctor>();
    if (seen.has(module)) return result;
    seen.add(module);
    const exported =
        (Reflect.getMetadata('exports', module) as unknown[] | undefined) ?? [];
    for (const item of exported) {
        if (typeof item !== 'function') continue;
        const asModule = item as Ctor;
        // Реэкспорт модуля: у модуля есть любая из метадат Nest
        // (imports/providers/exports/controllers) — у сервиса их нет.
        const isModule = [
            'imports',
            'providers',
            'exports',
            'controllers',
        ].some(key => Reflect.getMetadata(key, asModule) !== undefined);
        if (isModule) {
            for (const nested of exportsOf(asModule, seen)) result.add(nested);
            continue;
        }
        result.add(asModule);
    }
    return result;
}

function availableIn(module: Ctor): Set<Ctor> {
    const available = new Set<Ctor>(providersOf(module));
    const imported =
        (Reflect.getMetadata('imports', module) as unknown[] | undefined) ?? [];
    for (const item of imported) {
        if (typeof item !== 'function') continue;
        for (const exported of exportsOf(item as Ctor)) available.add(exported);
    }
    return available;
}

function dependenciesOf(provider: Ctor): Ctor[] {
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

describe('DI-граф CallReportModule (event-sales)', () => {
    it('все зависимости провайдеров конвейера доступны в модуле', () => {
        const available = availableIn(CallReportModule);
        const missing: string[] = [];
        for (const provider of providersOf(CallReportModule)) {
            for (const dependency of dependenciesOf(provider)) {
                if (!available.has(dependency)) {
                    missing.push(`${provider.name} → ${dependency.name}`);
                }
            }
        }
        expect(missing).toEqual([]);
    });
});
