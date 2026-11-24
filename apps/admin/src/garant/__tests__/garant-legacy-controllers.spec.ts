import 'reflect-metadata';
// AdminModule грузится первым: файлы Гаранта связаны циклами импорта
// (infoblock и infogroup), и метаданные их модулей зависят от порядка загрузки.
// Боевой порядок задаёт корень приложения, тест повторяет его.
import { AdminModule } from '../../admin.module';
import { PATH_METADATA } from '@nestjs/common/constants';
import type { DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { findMissingDependenciesDeep } from '@lib/core/testing/module-di-deep';
import { PrismaService } from 'src/core/prisma';
import { RegionAdminModule } from '@lib/garant/region/region.admin.module';
import { ComplectAdminModule } from '@lib/garant/complect/complect.admin.module';
import { ContractAdminModule } from '@lib/garant/contract/contract.admin.module';
import { SupplyAdminModule } from '@lib/garant/supply/supply.admin.module';
import { InfoblockAdminModule } from '@lib/garant/infoblock/infoblock.admin.module';
import { InfogroupAdminModule } from '@lib/garant/infogroup/infogroup.admin.module';
import { RegionController } from '@lib/garant/region/region.controller';
import { PortalRegionController } from '@lib/garant/region/portal-region/portal.region.controller';
import { ComplectController } from '@lib/garant/complect/complect.controller';
import { ContractController } from '@lib/garant/contract/contract.controller';
import { SupplyController } from '@lib/garant/supply/supply.controller';
import { InfoblockController } from '@lib/garant/infoblock/infoblock.controller';
import { InfogroupController } from '@lib/garant/infogroup/controllers/infogroup.controller';

/**
 * Приложение админки отдаёт ручки справочников Гаранта по прежним путям.
 *
 * Контроллеры `/region`, `/portal-region/*`, `/complect`, `/contracts`,
 * `/supply`, `/infoblock`, `/infogroup` вынесены из сервисных модулей
 * Гаранта в `*AdminModule`: приложение konstructor, которому нужны только
 * сервисы, их больше не публикует. Здесь проверено, что админка по-прежнему
 * регистрирует эти контроллеры (их ставит AdminAddModule, а глобальный гард
 * AuthModule.forRoot() закрывает все её ручки) и что граф зависимостей
 * каждого admin-модуля собирается.
 */

type Ctor = new (...args: never[]) => unknown;

const isFunction = (value: unknown): value is Ctor =>
    typeof value === 'function';

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
    typeof value === 'object' && value !== null;

const asList = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : [];

const isDynamicModule = (value: unknown): value is DynamicModule =>
    isRecord(value) && isFunction(value.module);

const unwrap = (entry: unknown): unknown =>
    isRecord(entry) && typeof entry.forwardRef === 'function'
        ? (entry.forwardRef as () => unknown)()
        : entry;

const metadataList = (key: string, target: object): unknown[] =>
    asList(Reflect.getMetadata(key, target));

/** Контроллеры всех модулей дерева: статические метаданные и динамические модули. */
const collectControllers = (root: unknown): Set<unknown> => {
    const visited = new Set<unknown>();
    const controllers = new Set<unknown>();
    const visit = (entry: unknown): void => {
        const value = unwrap(entry);
        if (visited.has(value)) return;
        visited.add(value);
        const dynamic = isDynamicModule(value) ? value : undefined;
        const cls = dynamic ? dynamic.module : value;
        if (!isFunction(cls)) return;
        for (const controller of [
            ...metadataList('controllers', cls),
            ...asList(dynamic?.controllers),
        ]) {
            controllers.add(unwrap(controller));
        }
        for (const imported of [
            ...metadataList('imports', cls),
            ...asList(dynamic?.imports),
        ]) {
            visit(imported);
        }
    };
    visit(root);
    return controllers;
};

/** Контроллер и путь, под которым он отвечает: раньше их отдавал GarantModule. */
const LEGACY_ROUTES: ReadonlyArray<readonly [Ctor, string]> = [
    [RegionController, 'region'],
    [PortalRegionController, 'portal-region'],
    [ComplectController, 'complect'],
    [ContractController, 'contracts'],
    [SupplyController, 'supply'],
    [InfoblockController, 'infoblock'],
    [InfogroupController, 'infogroup'],
];

const LEGACY_ADMIN_MODULES: ReadonlyArray<Ctor> = [
    RegionAdminModule,
    ComplectAdminModule,
    ContractAdminModule,
    SupplyAdminModule,
    InfoblockAdminModule,
    InfogroupAdminModule,
];

describe('админка: ручки справочников Гаранта по прежним путям', () => {
    let registered: Set<unknown>;

    beforeAll(() => {
        registered = collectControllers(AdminModule);
    });

    it('все семь контроллеров зарегистрированы в графе приложения', () => {
        const missing = LEGACY_ROUTES.filter(
            ([controller]) => !registered.has(controller),
        ).map(([controller]) => controller.name);
        expect(missing).toEqual([]);
    });

    it('пути контроллеров не изменились', () => {
        const paths = LEGACY_ROUTES.map(
            ([controller]) =>
                [
                    controller.name,
                    Reflect.getMetadata(PATH_METADATA, controller),
                ] as const,
        );
        expect(paths).toEqual(
            LEGACY_ROUTES.map(([controller, path]) => [controller.name, path]),
        );
    });

    it('каждый контроллер объявлен в admin-модуле своего раздела', () => {
        for (const module of LEGACY_ADMIN_MODULES) {
            expect(metadataList('controllers', module).length).toBeGreaterThan(
                0,
            );
        }
        const registeredByAdminModules = new Set<unknown>(
            LEGACY_ADMIN_MODULES.flatMap(module =>
                metadataList('controllers', module),
            ),
        );
        for (const [controller] of LEGACY_ROUTES) {
            expect(registeredByAdminModules.has(controller)).toBe(true);
        }
    });

    it.each(LEGACY_ADMIN_MODULES.map(module => [module.name, module] as const))(
        'граф зависимостей %s собирается (контроллеры получают сервисы)',
        (_name, module) => {
            // ConfigModule и PrismaModule в приложении глобальные.
            expect(
                findMissingDependenciesDeep(module, [
                    ConfigService,
                    PrismaService,
                ]),
            ).toEqual([]);
        },
    );
});
