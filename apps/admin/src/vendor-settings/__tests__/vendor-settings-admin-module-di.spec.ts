import { ConfigService } from '@nestjs/config';
import { findMissingDependenciesDeep } from '@lib/core/testing/module-di-deep';
import { PrismaService } from 'src/core/prisma';
import { VendorSettingsAdminModule } from '../vendor-settings-admin.module';

describe('DI-граф настроек приложения в админке', () => {
    it('контроллер и проверка Telegram-ботов получают зависимости (HTTP, прокси, настройки)', () => {
        // ConfigModule и PrismaModule в приложении глобальные.
        expect(
            findMissingDependenciesDeep(VendorSettingsAdminModule, [
                ConfigService,
                PrismaService,
            ]),
        ).toEqual([]);
    });
});
