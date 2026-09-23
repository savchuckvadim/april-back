import 'reflect-metadata';
import { SalesAiAnalyticsAdminModule } from '../sales-ai-analytics-admin.module';
import { SalesAiAnalyticsAuditModule } from '../sales-ai-analytics-audit.module';
import { SalesAiAnalyticsOpsModule } from '../sales-ai-analytics-ops.module';
import { SalesAiAnalyticsRetentionCronModule } from '../sales-ai-analytics-retention-cron.module';

/**
 * Статическая проверка DI-графа админ-слоя AI-аналитики: каждая
 * зависимость конструктора провайдера И КОНТРОЛЛЕРА обязана быть
 * доступна в модуле или в экспортах его импортов.
 *
 * ЗАЧЕМ: юнит-тесты сервисов работают на моках, поэтому забытый импорт
 * виден только при старте приложения — грабли `imports: [XxxModule]`
 * из ai/rules/app-api-surface.md (модуль получает лишь то, что импорт
 * ЭКСПОРТИРУЕТ). Образец проверки —
 * `apps/admin/src/portal/questionnaires/__tests__/questionnaires-module-di.spec.ts`.
 */

type Ctor = new (...args: never[]) => unknown;

const metadataOf = (module: Ctor, key: string): unknown[] =>
    (Reflect.getMetadata(key, module) as unknown[] | undefined) ?? [];

/** Провайдеры и контроллеры — все, у кого есть конструктор с зависимостями. */
function consumersOf(module: Ctor): Ctor[] {
    return [
        ...metadataOf(module, 'providers'),
        ...metadataOf(module, 'controllers'),
    ].filter((item): item is Ctor => typeof item === 'function');
}

function exportsOf(module: Ctor, seen = new Set<Ctor>()): Set<Ctor> {
    const result = new Set<Ctor>();
    if (seen.has(module)) return result;
    seen.add(module);
    for (const item of metadataOf(module, 'exports')) {
        if (typeof item !== 'function') continue;
        const exported = item as Ctor;
        // Реэкспорт модуля: у модуля есть любая из метадат Nest.
        const isModule = [
            'imports',
            'providers',
            'exports',
            'controllers',
        ].some(key => Reflect.getMetadata(key, exported) !== undefined);
        if (isModule) {
            for (const nested of exportsOf(exported, seen)) result.add(nested);
            continue;
        }
        result.add(exported);
    }
    return result;
}

function availableIn(module: Ctor): Set<Ctor> {
    const available = new Set<Ctor>(
        metadataOf(module, 'providers').filter(
            (item): item is Ctor => typeof item === 'function',
        ),
    );
    for (const item of metadataOf(module, 'imports')) {
        if (typeof item !== 'function') continue;
        for (const exported of exportsOf(item as Ctor)) available.add(exported);
    }
    return available;
}

function dependenciesOf(consumer: Ctor): Ctor[] {
    const params =
        (Reflect.getMetadata('design:paramtypes', consumer) as
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
 * Провайдеры с @Optional()-зависимостями: Nest разрешает им отсутствовать.
 * Сейчас такой один — ретенция с TelegramService (модуль @Global, в графе
 * библиотеки его нет).
 */
const OPTIONAL_DEPENDENCIES = new Set(['TelegramService']);

const missingIn = (module: Ctor): string[] => {
    const available = availableIn(module);
    const missing: string[] = [];
    for (const consumer of consumersOf(module)) {
        for (const dependency of dependenciesOf(consumer)) {
            if (OPTIONAL_DEPENDENCIES.has(dependency.name)) continue;
            if (!available.has(dependency)) {
                missing.push(`${consumer.name} → ${dependency.name}`);
            }
        }
    }
    return missing;
};

describe('DI-граф админ-слоя AI-аналитики', () => {
    it('сервисы эксплуатации получают стор, очередь и ростер порталов', () => {
        expect(missingIn(SalesAiAnalyticsOpsModule)).toEqual([]);
    });

    it('контроллеры админки получают все свои сервисы', () => {
        expect(missingIn(SalesAiAnalyticsAdminModule)).toEqual([]);
    });

    it('крон ретенции получает сервис ретенции и настройки порталов', () => {
        expect(missingIn(SalesAiAnalyticsRetentionCronModule)).toEqual([]);
    });

    it('сервисный модуль аудита остаётся самодостаточным', () => {
        expect(missingIn(SalesAiAnalyticsAuditModule)).toEqual([]);
    });
});
