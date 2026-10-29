import { ConfigService } from '@nestjs/config';
import { findMissingDependenciesDeep } from '@lib/core/testing/module-di-deep';
import { AppModule } from '../app.module';

/**
 * bot собирается целиком: каждая зависимость каждого модуля дерева,
 * включая модули библиотек, доступна. Боевой случай 29.10.2026: ядро
 * ai-rag пришло через шлюз LLM без StorageService, и bot не стартовал.
 */
describe('DI-граф приложения bot', () => {
    it('все зависимости во всём дереве модулей доступны', () => {
        expect(findMissingDependenciesDeep(AppModule, [ConfigService])).toEqual(
            [],
        );
    });
});
