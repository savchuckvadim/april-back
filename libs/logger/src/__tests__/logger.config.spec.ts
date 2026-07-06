import { buildLoggerConfig } from '../config/logger.config';

describe('buildLoggerConfig', () => {
    it('дефолт для development: уровень debug, цветной вывод, telegram выключен', () => {
        const config = buildLoggerConfig({ NODE_ENV: 'development' });
        expect(config).toEqual({
            level: 'debug',
            telegramLevel: 'none',
            env: 'development',
            json: false,
        });
    });

    it('дефолт для production: уровень log и JSON-формат', () => {
        const config = buildLoggerConfig({ NODE_ENV: 'production' });
        expect(config.level).toBe('log');
        expect(config.json).toBe(true);
        expect(config.env).toBe('production');
    });

    it('без NODE_ENV считается development', () => {
        const config = buildLoggerConfig({});
        expect(config.env).toBe('development');
        expect(config.json).toBe(false);
    });

    it('LOG_LEVEL переопределяет дефолт', () => {
        const config = buildLoggerConfig({
            NODE_ENV: 'production',
            LOG_LEVEL: 'verbose',
        });
        expect(config.level).toBe('verbose');
    });

    it('невалидный LOG_LEVEL игнорируется (берётся дефолт)', () => {
        const config = buildLoggerConfig({
            NODE_ENV: 'production',
            LOG_LEVEL: 'trace',
        });
        expect(config.level).toBe('log');
    });

    it('LOG_LEVEL=silent полностью отключает логи', () => {
        const config = buildLoggerConfig({ LOG_LEVEL: 'silent' });
        expect(config.level).toBe('silent');
    });

    it('LOGS_ENABLED=false отключает логи независимо от LOG_LEVEL', () => {
        const config = buildLoggerConfig({
            LOG_LEVEL: 'debug',
            LOGS_ENABLED: 'false',
        });
        expect(config.level).toBe('silent');
    });

    it('LOG_TELEGRAM_LEVEL=error включает дублирование ошибок в Telegram', () => {
        const config = buildLoggerConfig({ LOG_TELEGRAM_LEVEL: 'error' });
        expect(config.telegramLevel).toBe('error');
    });

    it('невалидный LOG_TELEGRAM_LEVEL трактуется как none', () => {
        const config = buildLoggerConfig({ LOG_TELEGRAM_LEVEL: 'warn' });
        expect(config.telegramLevel).toBe('none');
    });
});
