import 'reflect-metadata';
import { PortalQuestionnairesAdminModule } from '@lib/portal-lib/store/questionnaires/portal-questionnaires.admin.module';
import { AdminQuestionnairesModule } from '../questionnaires.module';

/**
 * Статическая проверка DI-графа админского каталога анкет: каждая
 * зависимость конструктора провайдера И КОНТРОЛЛЕРА обязана быть
 * доступна в модуле или в экспортах его импортов.
 *
 * ЗАЧЕМ: юнит-тесты сервисов работают на моках, поэтому забытый импорт
 * виден только при старте приложения. Отдельные грабли ровно этого места
 * (ai/rules/app-api-surface.md): `imports: [XxxModule]` даёт модулю лишь
 * то, что тот ЭКСПОРТИРУЕТ, — контроллер админки, попросивший что-то из
 * импортов чужого модуля, падает UnknownDependenciesException уже в
 * рантайме.
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
        // Реэкспорт модуля: у модуля есть любая из метадат Nest, у сервиса
        // их нет.
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

const missingIn = (module: Ctor): string[] => {
    const available = availableIn(module);
    const missing: string[] = [];
    for (const consumer of consumersOf(module)) {
        for (const dependency of dependenciesOf(consumer)) {
            if (!available.has(dependency)) {
                missing.push(`${consumer.name} → ${dependency.name}`);
            }
        }
    }
    return missing;
};

describe('DI-граф каталога анкет (admin)', () => {
    it('редактор анкет получает сервис из лёгкого модуля стора', () => {
        expect(missingIn(PortalQuestionnairesAdminModule)).toEqual([]);
    });

    it('источник полей и сверка привязок получают Битрикс и стор', () => {
        expect(missingIn(AdminQuestionnairesModule)).toEqual([]);
    });
});
