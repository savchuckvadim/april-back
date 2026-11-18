import { ConfigService } from '@nestjs/config';
import { Role } from '@lib/auth';
import { ROLES_KEY } from '@lib/auth/config/auth.constants';
import { findMissingDependenciesDeep } from '@lib/core/testing/module-di-deep';
import { SiteMediaLibraryFilesAdminController } from '../controllers/site-media-library-files.admin.controller';
import { SiteMediaLibraryAdminController } from '../controllers/site-media-library.admin.controller';
import { SiteMediaLibraryAdminModule } from '../site-media-library-admin.module';
import { SiteMediaLibraryModule } from '../site-media-library.module';

const controllersOf = (module: object): unknown[] => {
    const list: unknown = Reflect.getMetadata('controllers', module);
    return Array.isArray(list) ? list : [];
};

/**
 * DI-граф модулей медиатеки (UnknownDependenciesException сборка не ловит)
 * и раскол по ai/rules/app-api-surface.md. ConfigService даёт глобальный
 * ConfigModule приложений.
 */
describe('модули медиатеки сайта', () => {
    it.each([
        ['SiteMediaLibraryModule', SiteMediaLibraryModule],
        ['SiteMediaLibraryAdminModule (admin)', SiteMediaLibraryAdminModule],
    ])('%s: все зависимости доступны', (_name, module) => {
        expect(findMissingDependenciesDeep(module, [ConfigService])).toEqual(
            [],
        );
    });

    it('сервисный модуль не публикует контроллеров, админский — только ручки медиатеки', () => {
        expect(controllersOf(SiteMediaLibraryModule)).toEqual([]);
        expect(controllersOf(SiteMediaLibraryAdminModule)).toEqual([
            SiteMediaLibraryAdminController,
            SiteMediaLibraryFilesAdminController,
        ]);
    });

    it.each([
        SiteMediaLibraryAdminController,
        SiteMediaLibraryFilesAdminController,
    ])('%p — только суперпользователь', controller => {
        expect(Reflect.getMetadata(ROLES_KEY, controller)).toEqual([
            Role.SUPER_USER,
        ]);
    });
});
