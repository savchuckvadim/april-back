import 'reflect-metadata';
import { AppCacheService } from '@lib/app-cache';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import {
    exportsOf,
    metadataList,
    missingDependencies,
} from '../../__tests__/fixtures/module-di.util';
import { AI_ANALYTICS_CORE_PBX_PROVIDERS } from '../../core/ai-analytics-core-pbx.module';
import { StyleCrmLoader } from '../../domain/loaders/style-crm.loader';
import { AiAnalyticsStyleController } from '../ai-analytics-style.controller';
import { AiAnalyticsStyleModule } from '../ai-analytics-style.module';
import { StyleProfileUseCase } from '../style-profile.use-case';
import { StyleSettingsLoader } from '../style-settings.loader';

/**
 * Карточка стиля подключается отдельным модулем: подписи о человеке —
 * самая чувствительная часть витрины, её поверхность приложение включает
 * осознанно. DI-граф модуля обязан закрываться сам, а наружу он публикует
 * только свою ручку. Загрузчик жёстких счётчиков телефонии уехал в
 * PBX-половину ядра (его читает ночной шаг стиля), поэтому Битрикс модулю
 * карточки больше не нужен.
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

    it('наружу отдаются настройка отказа и use-case карточки', () => {
        expect([...exportsOf(AiAnalyticsStyleModule)]).toEqual([
            StyleSettingsLoader,
            StyleProfileUseCase,
        ]);
    });

    it('модуль карточки не тянет PBXModule: счётчики телефонии — в ядре с PBX', () => {
        expect(metadataList(AiAnalyticsStyleModule, 'imports')).not.toContain(
            PBXModule,
        );
        expect(metadataList(AiAnalyticsStyleModule, 'providers')).not.toContain(
            StyleCrmLoader,
        );
        expect(AI_ANALYTICS_CORE_PBX_PROVIDERS).toContain(StyleCrmLoader);
    });
});
