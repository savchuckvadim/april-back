import { ConfigService } from '@nestjs/config';
import { findMissingDependenciesDeep } from '@lib/core/testing/module-di-deep';
import { AppModule } from '../app.module';

/**
 * pbx собирается целиком: каждая зависимость каждого модуля дерева,
 * включая библиотеки (кабинет клиента, маркетплейс, настройки вендора),
 * доступна — дыра во вложенном модуле видна только при старте.
 */
describe('DI-граф приложения pbx', () => {
    it('все зависимости во всём дереве модулей доступны', () => {
        expect(findMissingDependenciesDeep(AppModule, [ConfigService])).toEqual(
            [],
        );
    });
});
