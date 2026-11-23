import 'reflect-metadata';
import { BitrixDocumentSaveFlowService } from '@app/konstructor/offer-word/services/bitrix/bitrix-document-save-flow.service';
import { OfferWordModule } from '@app/konstructor/offer-word/offer-word.module';
import { InitSupplyModule } from '../init-supply.module';
import { InitSupplyDiskService } from '../services/disk/init-supply-disk.service';

/**
 * Статическая проверка DI-графа модуля поставки: каждая зависимость
 * конструктора провайдера доступна в самом модуле или в экспортах его
 * импортов. Юнит-тесты сервисов работают на моках, и забытый импорт модуля
 * иначе вскроется только при старте приложения.
 *
 * Диск заявки берётся у OfferWordModule, без своей копии провайдера.
 */

type Ctor = new (...args: never[]) => unknown;

const metadata = (key: string, target: Ctor): unknown[] =>
    (Reflect.getMetadata(key, target) as unknown[] | undefined) ?? [];

const providersOf = (module: Ctor): Ctor[] =>
    metadata('providers', module).filter(
        (provider): provider is Ctor => typeof provider === 'function',
    );

const isModule = (target: Ctor): boolean =>
    ['imports', 'providers', 'exports', 'controllers'].some(
        key => Reflect.getMetadata(key, target) !== undefined,
    );

const exportsOf = (module: Ctor, seen = new Set<Ctor>()): Set<Ctor> => {
    const result = new Set<Ctor>();
    if (seen.has(module)) return result;
    seen.add(module);
    for (const item of metadata('exports', module)) {
        if (typeof item !== 'function') continue;
        const exported = item as Ctor;
        if (isModule(exported)) {
            for (const nested of exportsOf(exported, seen)) result.add(nested);
            continue;
        }
        result.add(exported);
    }
    return result;
};

const availableIn = (module: Ctor): Set<Ctor> => {
    const available = new Set<Ctor>(providersOf(module));
    for (const item of metadata('imports', module)) {
        if (typeof item !== 'function') continue;
        for (const exported of exportsOf(item as Ctor)) available.add(exported);
    }
    return available;
};

const dependenciesOf = (provider: Ctor): Ctor[] =>
    (
        (Reflect.getMetadata('design:paramtypes', provider) as
            | unknown[]
            | undefined) ?? []
    ).filter(
        (param): param is Ctor =>
            typeof param === 'function' &&
            ![Object, String, Number, Boolean, Array, Function].includes(
                param as never,
            ),
    );

describe('DI-граф InitSupplyModule', () => {
    it('все зависимости провайдеров доступны в модуле', () => {
        const available = availableIn(InitSupplyModule);
        const missing: string[] = [];
        for (const provider of providersOf(InitSupplyModule)) {
            for (const dependency of dependenciesOf(provider)) {
                if (!available.has(dependency)) {
                    missing.push(`${provider.name} → ${dependency.name}`);
                }
            }
        }
        expect(missing).toEqual([]);
    });

    it('сервис Диска заявки зарегистрирован; сервис папок приходит из экспорта OfferWordModule без своей копии', () => {
        expect(providersOf(InitSupplyModule)).toContain(InitSupplyDiskService);
        expect(providersOf(InitSupplyModule)).not.toContain(
            BitrixDocumentSaveFlowService,
        );
        expect(metadata('imports', InitSupplyModule)).toContain(
            OfferWordModule,
        );
        expect(exportsOf(OfferWordModule)).toContain(
            BitrixDocumentSaveFlowService,
        );
    });
});
