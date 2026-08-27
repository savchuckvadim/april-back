import 'reflect-metadata';
import { CallReportWeeklyModule } from '../weekly-report/call-report-weekly.module';
import { KnowledgeMaterialsModule } from '../knowledge-materials.module';
import { CallReportSmartModule } from '../call-report-smart.module';

/**
 * Статическая проверка DI-графа модулей: у каждого провайдера все
 * зависимости конструктора обязаны быть доступны — либо среди провайдеров
 * самого модуля, либо среди экспортов импортированных модулей.
 *
 * ЗАЧЕМ: юнит-тесты сервисов работают на моках и такую ошибку не видят —
 * приложение падает уже при старте в проде (боевой случай 27.08.2026:
 * CallReportWeeklyDataService получил CallReportSmartResolverService, а
 * модуль отчёта не импортировал модуль смарта, и деплой упал с
 * UnknownDependenciesException).
 */

type Ctor = new (...args: never[]) => unknown;

/** Провайдеры модуля (только классы; фабрики и токены пропускаем). */
function providersOf(module: Ctor): Ctor[] {
    const providers =
        (Reflect.getMetadata('providers', module) as unknown[] | undefined) ??
        [];
    return providers.filter(
        (provider): provider is Ctor => typeof provider === 'function',
    );
}

/** Что модуль отдаёт наружу — включая реэкспорт целых модулей. */
function exportsOf(module: Ctor, seen = new Set<Ctor>()): Set<Ctor> {
    const result = new Set<Ctor>();
    if (seen.has(module)) return result;
    seen.add(module);

    const exported =
        (Reflect.getMetadata('exports', module) as unknown[] | undefined) ?? [];
    for (const item of exported) {
        if (typeof item !== 'function') continue;
        const asModule = item as Ctor;
        // Экспорт модуля целиком: наружу уходят уже ЕГО экспорты.
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

/** Всё, что доступно модулю: свои провайдеры + экспорты импортов. */
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

/** Классовые зависимости конструктора провайдера. */
function dependenciesOf(provider: Ctor): Ctor[] {
    const params =
        (Reflect.getMetadata('design:paramtypes', provider) as
            | unknown[]
            | undefined) ?? [];
    return params.filter(
        (param): param is Ctor =>
            typeof param === 'function' &&
            // Примитивы и нетипизированные аргументы (интерфейсы, токены)
            // в графе не участвуют.
            ![Object, String, Number, Boolean, Array, Function].includes(
                param as never,
            ),
    );
}

/** Незакрытые зависимости модуля: «провайдер → чего ему не хватает». */
function missingDependencies(module: Ctor): string[] {
    const available = availableIn(module);
    const problems: string[] = [];
    for (const provider of providersOf(module)) {
        for (const dependency of dependenciesOf(provider)) {
            if (!available.has(dependency)) {
                problems.push(`${provider.name} → ${dependency.name}`);
            }
        }
    }
    return problems;
}

describe('DI-граф модулей call-report', () => {
    it('CallReportWeeklyModule: все зависимости провайдеров доступны', () => {
        expect(missingDependencies(CallReportWeeklyModule)).toEqual([]);
    });

    it('KnowledgeMaterialsModule: все зависимости провайдеров доступны', () => {
        expect(missingDependencies(KnowledgeMaterialsModule)).toEqual([]);
    });

    it('CallReportSmartModule: все зависимости провайдеров доступны', () => {
        expect(missingDependencies(CallReportSmartModule)).toEqual([]);
    });
});
