import 'reflect-metadata';
import { AppCacheService } from '@lib/app-cache';
import { AiAnalyticsModule } from '../ai-analytics.module';

/**
 * Статическая проверка DI-графа модуля (по образцу
 * apps/event-sales call-report-module-di.spec.ts): каждая зависимость
 * конструктора провайдера и контроллера обязана быть доступна в модуле
 * или в экспортах его импортов. Глобальные провайдеры приложения
 * (AppCacheService из @Global AppCacheServiceModule) — в белом списке.
 */

type Ctor = new (...args: never[]) => unknown;

const GLOBAL_PROVIDERS: Ctor[] = [AppCacheService];

function metadataList(module: Ctor, key: string): Ctor[] {
    const items =
        (Reflect.getMetadata(key, module) as unknown[] | undefined) ?? [];
    return items.filter((item): item is Ctor => typeof item === 'function');
}

function isModule(candidate: Ctor): boolean {
    return ['imports', 'providers', 'exports', 'controllers'].some(
        key => Reflect.getMetadata(key, candidate) !== undefined,
    );
}

function exportsOf(module: Ctor, seen = new Set<Ctor>()): Set<Ctor> {
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

function availableIn(module: Ctor): Set<Ctor> {
    const available = new Set<Ctor>([
        ...metadataList(module, 'providers'),
        ...GLOBAL_PROVIDERS,
    ]);
    for (const imported of metadataList(module, 'imports')) {
        for (const exported of exportsOf(imported)) available.add(exported);
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

describe('DI-граф AiAnalyticsModule (kpi-report-sales)', () => {
    it('все зависимости провайдеров и контроллера доступны в модуле', () => {
        const available = availableIn(AiAnalyticsModule);
        const missing: string[] = [];
        const units = [
            ...metadataList(AiAnalyticsModule, 'providers'),
            ...metadataList(AiAnalyticsModule, 'controllers'),
        ];
        expect(units.length).toBeGreaterThan(0);
        for (const unit of units) {
            for (const dependency of dependenciesOf(unit)) {
                if (!available.has(dependency)) {
                    missing.push(`${unit.name} → ${dependency.name}`);
                }
            }
        }
        expect(missing).toEqual([]);
    });

    it('модуль не публикует чужих контроллеров (только AiAnalyticsController)', () => {
        const controllers = metadataList(AiAnalyticsModule, 'controllers').map(
            ctor => ctor.name,
        );
        expect(controllers).toEqual(['AiAnalyticsController']);
        // Импортируемые lib-модули — сервисные, без контроллеров (app-api-surface),
        // кроме BxDepartmentModule, чьи роуты приложение публикует и так.
        const leaking = metadataList(AiAnalyticsModule, 'imports')
            .filter(imported => imported.name !== 'BxDepartmentModule')
            .filter(
                imported => metadataList(imported, 'controllers').length > 0,
            )
            .map(imported => imported.name);
        expect(leaking).toEqual([]);
    });
});
