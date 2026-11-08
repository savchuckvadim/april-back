import { ConfigService } from '@nestjs/config';
import { findMissingDependenciesDeep } from '@lib/core/testing/module-di-deep';
import {
    CabinetAdminModule,
    CabinetApiModule,
    CabinetTelegramWebhookModule,
} from '../cabinet-api.module';

/**
 * Модули кабинета собираются целиком в любом приложении-потребителе
 * (pbx, admin, bot): почта и настройки вендора — необязательные
 * (@Optional), всё остальное модуль приносит сам.
 */
describe('DI-граф модулей кабинета клиента', () => {
    it.each([
        ['CabinetApiModule (pbx)', CabinetApiModule],
        ['CabinetAdminModule (admin)', CabinetAdminModule],
        ['CabinetTelegramWebhookModule (bot)', CabinetTelegramWebhookModule],
    ])('%s: все зависимости доступны', (_name, module) => {
        expect(findMissingDependenciesDeep(module, [ConfigService])).toEqual(
            [],
        );
    });
});
