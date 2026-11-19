import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { findMissingModuleDependencies } from '@lib/core/testing/module-di';
import { TranscriptionProviderModule } from '../provider/transcription-provider.module';
import { YandexSubmissionModule } from '../provider/yandex-submission.module';
import { TranscriptionModule } from '../transcription.module';
import { TranscriptionSpendModule } from '../transcription-spend.module';

/**
 * Страж отправок в Яндекс (19.11.2026) нужен роутеру call-report, старому
 * пути POST /transcription и странице расхода: забытый импорт виден только
 * при старте приложения — проверяем граф статически.
 */
describe('DI-граф модулей транскрибации со стражем Яндекса', () => {
    it.each([
        ['YandexSubmissionModule', YandexSubmissionModule],
        [
            'TranscriptionProviderModule (роутер call-report)',
            TranscriptionProviderModule,
        ],
        [
            'TranscriptionModule (старый POST /transcription)',
            TranscriptionModule,
        ],
        [
            'TranscriptionSpendModule (страница расхода)',
            TranscriptionSpendModule,
        ],
    ])('%s: все зависимости доступны', (_name, module) => {
        expect(findMissingModuleDependencies(module, [ConfigService])).toEqual(
            [],
        );
    });
});
