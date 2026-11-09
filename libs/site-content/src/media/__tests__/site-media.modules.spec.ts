import { ConfigService } from '@nestjs/config';
import { findMissingModuleDependencies } from '@lib/core/testing/module-di';
import { SiteMediaAdminModule } from '../site-media-admin.module';
import { SiteMediaModule } from '../site-media.module';
import { SiteMediaPublicModule } from '../site-media-public.module';

/** ConfigService даёт глобальный ConfigModule приложений admin и bot. */
describe('модули картинок и видео сайта', () => {
    it.each([
        ['SiteMediaModule', SiteMediaModule],
        ['SiteMediaAdminModule', SiteMediaAdminModule],
        ['SiteMediaPublicModule', SiteMediaPublicModule],
    ])('%s: все зависимости доступны', (_name, module) => {
        expect(findMissingModuleDependencies(module, [ConfigService])).toEqual(
            [],
        );
    });
});
