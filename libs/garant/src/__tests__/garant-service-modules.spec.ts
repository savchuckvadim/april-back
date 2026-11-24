import 'reflect-metadata';
import type { DynamicModule } from '@nestjs/common';
import { GarantModule } from '../garant.module';
import { PriceModule } from '../price/price.module';
import { InfoblockModule } from '../infoblock/infoblock.module';
import { ComplectModule } from '../complect/complect.module';
import { SupplyModule } from '../supply/supply.module';
import { InfogroupModule } from '../infogroup/infogroup.module';
import { RegionModule } from '../region/region.module';
import { ContractModule } from '../contract/contract.module';
import { PackageModule } from '../package/package.module';
import { CatalogInstallModule } from '../catalog-install/catalog-install.module';
import { CatalogTableModule } from '../catalog-table/catalog-table.module';
import { RegionAdminModule } from '../region/region.admin.module';
import { ComplectAdminModule } from '../complect/complect.admin.module';
import { ContractAdminModule } from '../contract/contract.admin.module';
import { SupplyAdminModule } from '../supply/supply.admin.module';
import { InfoblockAdminModule } from '../infoblock/infoblock.admin.module';
import { InfogroupAdminModule } from '../infogroup/infogroup.admin.module';
import { RegionController } from '../region/region.controller';
import { PortalRegionController } from '../region/portal-region/portal.region.controller';
import { ComplectController } from '../complect/complect.controller';
import { ContractController } from '../contract/contract.controller';
import { SupplyController } from '../supply/supply.controller';
import { InfoblockController } from '../infoblock/infoblock.controller';
import { InfogroupController } from '../infogroup/controllers/infogroup.controller';

/**
 * Сервисные модули Гаранта не регистрируют контроллеров.
 *
 * GarantModule подключают konstructor (публичное приложение без глобального
 * гарда авторизации) и admin. Контроллер в сервисном модуле попадает в оба
 * приложения, и ручки записи справочников открываются на публичном хосте.
 * Контроллеры живут в `*AdminModule` разделов и подключаются только в admin.
 */

type Ctor = new (...args: never[]) => unknown;

const isFunction = (value: unknown): value is Ctor =>
    typeof value === 'function';

const asList = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : [];

const unwrap = (entry: unknown): unknown =>
    typeof entry === 'object' &&
    entry !== null &&
    'forwardRef' in entry &&
    typeof entry.forwardRef === 'function'
        ? (entry.forwardRef as () => unknown)()
        : entry;

const metadataList = (key: string, target: object): unknown[] =>
    asList(Reflect.getMetadata(key, target));

/** Классы модулей дерева, достижимого от корня по imports (динамические берём по module). */
const collectModules = (root: Ctor): Ctor[] => {
    const found = new Set<Ctor>();
    const visit = (entry: unknown): void => {
        const value = unwrap(entry);
        const dynamic =
            typeof value === 'object' && value !== null && 'module' in value
                ? (value as DynamicModule)
                : undefined;
        const cls = dynamic ? dynamic.module : value;
        if (!isFunction(cls) || found.has(cls)) return;
        found.add(cls);
        for (const imported of [
            ...metadataList('imports', cls),
            ...asList(dynamic?.imports),
        ]) {
            visit(imported);
        }
    };
    visit(root);
    return [...found];
};

const SERVICE_MODULES: ReadonlyArray<Ctor> = [
    GarantModule,
    PriceModule,
    InfoblockModule,
    ComplectModule,
    SupplyModule,
    InfogroupModule,
    RegionModule,
    ContractModule,
    PackageModule,
    CatalogInstallModule,
    CatalogTableModule,
];

describe('сервисные модули Гаранта', () => {
    it.each(SERVICE_MODULES.map(module => [module.name, module] as const))(
        '%s не регистрирует контроллеров',
        (_name, module) => {
            expect(metadataList('controllers', module)).toEqual([]);
        },
    );

    it.each(
        [
            ...SERVICE_MODULES,
            RegionAdminModule,
            ComplectAdminModule,
            ContractAdminModule,
            SupplyAdminModule,
            InfoblockAdminModule,
            InfogroupAdminModule,
        ].map(module => [module.name, module] as const),
    )(
        '%s: в метаданных нет undefined (цикл импорта файлов оборвал бы старт Nest)',
        (_name, module) => {
            // GarantModule импортирован первым, как в корне приложения:
            // файлы infoblock и infogroup связаны циклом импорта.
            for (const key of [
                'imports',
                'providers',
                'exports',
                'controllers',
            ]) {
                expect(metadataList(key, module)).not.toContain(undefined);
            }
        },
    );

    it('GarantModule подтягивает в дерево все сервисные модули разделов', () => {
        const tree = new Set<Ctor>(collectModules(GarantModule));
        for (const module of [
            PriceModule,
            InfoblockModule,
            ComplectModule,
            SupplyModule,
            InfogroupModule,
            RegionModule,
            ContractModule,
            PackageModule,
        ]) {
            expect(tree.has(module)).toBe(true);
        }
    });

    it('в дереве GarantModule нет модулей с контроллерами', () => {
        const withControllers = collectModules(GarantModule)
            .filter(module => metadataList('controllers', module).length > 0)
            .map(module => module.name);
        expect(withControllers).toEqual([]);
    });
});

describe('admin-модули Гаранта', () => {
    const ADMIN_MODULES: ReadonlyArray<readonly [Ctor, Ctor[]]> = [
        [RegionAdminModule, [RegionController, PortalRegionController]],
        [ComplectAdminModule, [ComplectController]],
        [ContractAdminModule, [ContractController]],
        [SupplyAdminModule, [SupplyController]],
        [InfoblockAdminModule, [InfoblockController]],
        [InfogroupAdminModule, [InfogroupController]],
    ];

    it.each(
        ADMIN_MODULES.map(
            ([module, controllers]) =>
                [module.name, module, controllers] as const,
        ),
    )(
        '%s объявляет контроллеры своего раздела',
        (_name, module, controllers) => {
            expect(metadataList('controllers', module)).toEqual(controllers);
        },
    );

    it('сервисы раздела admin-модуль берёт у сервисного модуля через imports', () => {
        const serviceModuleOf: ReadonlyArray<readonly [Ctor, Ctor]> = [
            [RegionAdminModule, RegionModule],
            [ComplectAdminModule, ComplectModule],
            [ContractAdminModule, ContractModule],
            [SupplyAdminModule, SupplyModule],
            [InfoblockAdminModule, InfoblockModule],
            [InfogroupAdminModule, InfogroupModule],
        ];
        for (const [adminModule, serviceModule] of serviceModuleOf) {
            expect(metadataList('imports', adminModule)).toContain(
                serviceModule,
            );
        }
    });
});
