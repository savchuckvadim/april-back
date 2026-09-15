import 'reflect-metadata';
import { AppCacheService } from '@lib/app-cache';
import {
    exportsOf,
    metadataList,
    missingDependencies,
} from '../../__tests__/fixtures/module-di.util';
import { StyleCrmLoader } from '../../domain/loaders/style-crm.loader';
import { AiAnalyticsStyleController } from '../ai-analytics-style.controller';
import { AiAnalyticsStyleModule } from '../ai-analytics-style.module';
import { StyleProfileUseCase } from '../style-profile.use-case';
import { StyleSettingsLoader } from '../style-settings.loader';

/**
 * Карточка стиля подключается отдельным модулем: подписи о человеке —
 * самая чувствительная часть витрины, её поверхность приложение включает
 * осознанно. DI-граф модуля обязан закрываться сам, а наружу он публикует
 * только свою ручку.
 */
describe('DI-граф AiAnalyticsStyleModule', () => {
    it('все зависимости провайдеров и контроллера доступны в модуле', () => {
        expect(
            missingDependencies(AiAnalyticsStyleModule, [AppCacheService]),
        ).toEqual([]);
    });

    it('модуль публикует только ручку карточки стиля', () => {
        expect(metadataList(AiAnalyticsStyleModule, 'controllers')).toEqual([
            AiAnalyticsStyleController,
        ]);
    });

    it('наружу отдаются загрузчик счётчиков, настройка отказа и use-case карточки', () => {
        expect([...exportsOf(AiAnalyticsStyleModule)]).toEqual([
            StyleCrmLoader,
            StyleSettingsLoader,
            StyleProfileUseCase,
        ]);
    });
});
