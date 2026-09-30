import 'reflect-metadata';
import { AiAnalyticsModule } from '../ai-analytics.module';
import { buildSettingsKey } from '../cache/cache-key.util';
import { AI_ANALYTICS_SETTINGS_TTL_SECONDS } from '../constants/ai-analytics.const';
import { CachedSettingsReader } from '../domain/use-cases/cached-settings.reader';
import { AI_READINESS_MODE_SOURCE } from '../domain/use-cases/readiness-mode.source';

/**
 * Готовность для других ручек — через тот же кэш, что у settings/get:
 * ключ и TTL общие, режим — ровно тот, что видит баннер.
 */
describe('CachedSettingsReader', () => {
    const DOMAIN = 'april.bitrix24.ru';
    const settings = { readiness: { mode: 'descriptive' } };

    function make() {
        const execute = jest.fn().mockResolvedValue(settings);
        const remember = jest.fn(
            async (
                _key: string,
                _ttl: number,
                compute: () => Promise<unknown>,
            ) => ({
                value: await compute(),
                fromCache: false,
            }),
        );
        const reader = new CachedSettingsReader(
            { remember } as never,
            { execute } as never,
        );
        return { reader, remember, execute };
    }

    it('читает через кэш settings/get с тем же ключом и TTL', async () => {
        const { reader, remember, execute } = make();

        await expect(reader.readinessMode(DOMAIN)).resolves.toBe('descriptive');
        expect(remember).toHaveBeenCalledWith(
            buildSettingsKey(DOMAIN),
            AI_ANALYTICS_SETTINGS_TTL_SECONDS,
            expect.any(Function),
        );
        expect(execute).toHaveBeenCalledWith(DOMAIN);
    });

    it('порт режима готовности прогноза в модуле — это CachedSettingsReader', () => {
        const providers = (Reflect.getMetadata(
            'providers',
            AiAnalyticsModule,
        ) ?? []) as unknown[];
        expect(providers).toContainEqual({
            provide: AI_READINESS_MODE_SOURCE,
            useExisting: CachedSettingsReader,
        });
    });
});
