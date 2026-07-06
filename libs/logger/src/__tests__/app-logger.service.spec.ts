import Transport from 'winston-transport';
import { AppLoggerService } from '../app-logger.service';
import { LoggerConfig } from '../config/logger.config';
import { AppLogInfo } from '../transports/telegram.transport';

/** Транспорт-ловушка: записывает все дошедшие до него лог-записи. */
class CaptureTransport extends Transport {
    public readonly records: AppLogInfo[] = [];

    log(info: AppLogInfo, callback: () => void): void {
        this.records.push(info);
        callback();
    }
}

const baseConfig: LoggerConfig = {
    level: 'debug',
    telegramLevel: 'none',
    env: 'test',
    json: false,
};

const makeTelegramSink = () => ({
    sendMessage: jest.fn<Promise<void>, [string]>(() => Promise.resolve()),
});

const makeLogger = (
    config: Partial<LoggerConfig> = {},
    telegramSink: ReturnType<typeof makeTelegramSink> | null = null,
) => {
    const capture = new CaptureTransport();
    const service = new AppLoggerService(
        'admin',
        { ...baseConfig, ...config },
        telegramSink,
        [capture],
    );
    return { service, capture };
};

describe('AppLoggerService', () => {
    it('каждая запись несёт метки app и env', () => {
        const { service, capture } = makeLogger();
        service.log('привет');

        expect(capture.records).toHaveLength(1);
        expect(capture.records[0]).toMatchObject({
            app: 'admin',
            env: 'test',
            // nest-уровень 'log' хранится как 'info'
            level: 'info',
            message: 'привет',
        });
    });

    it('фильтрует записи ниже настроенного уровня', () => {
        const { service, capture } = makeLogger({ level: 'warn' });

        service.error('e');
        service.warn('w');
        service.log('l');
        service.debug('d');
        service.verbose('v');

        expect(capture.records.map(r => r.level)).toEqual(['error', 'warn']);
    });

    it('уровень verbose пропускает всё (порядок уровней как в Nest)', () => {
        const { service, capture } = makeLogger({ level: 'verbose' });

        service.debug('d');
        service.verbose('v');

        expect(capture.records.map(r => r.level)).toEqual(['debug', 'verbose']);
    });

    it('silent полностью отключает вывод', () => {
        const { service, capture } = makeLogger({ level: 'silent' });

        service.error('никто не увидит');
        service.log('и это тоже');

        expect(capture.records).toHaveLength(0);
    });

    it('последний строковый параметр трактуется как context (конвенция Nest)', () => {
        const { service, capture } = makeLogger();
        service.log('сообщение', 'MyService');

        expect(capture.records[0]).toMatchObject({
            message: 'сообщение',
            context: 'MyService',
        });
    });

    it('error(message, stack, context) раскладывается на trace и context', () => {
        const { service, capture } = makeLogger();
        service.error('упало', 'Error: упало\n    at x.ts:1', 'MyService');

        expect(capture.records[0]).toMatchObject({
            message: 'упало',
            trace: 'Error: упало\n    at x.ts:1',
            context: 'MyService',
        });
    });

    it('Error-объект: message в лог, stack в trace', () => {
        const { service, capture } = makeLogger();
        const err = new Error('boom');
        service.error(err, 'MyService');

        expect(capture.records[0].message).toBe('boom');
        expect(capture.records[0].trace).toBe(err.stack);
        expect(capture.records[0].context).toBe('MyService');
    });

    it('объект-параметр сливается в meta (кастомные поля для фильтрации)', () => {
        const { service, capture } = makeLogger();
        service.log(
            'сделка обработана',
            { xo: 'x77', dealId: 42 },
            'MyService',
        );

        expect(capture.records[0]).toMatchObject({
            message: 'сделка обработана',
            context: 'MyService',
            meta: { xo: 'x77', dealId: 42 },
        });
    });

    it('несколько объектов-параметров сливаются, скаляры уходят в meta.params', () => {
        const { service, capture } = makeLogger();
        service.log('msg', { xo: 'x77' }, { domain: 'april.ru' }, 123);

        expect(capture.records[0].meta).toEqual({
            xo: 'x77',
            domain: 'april.ru',
            params: [123],
        });
    });

    it('undefined-параметры (пустой stack от Nest) не попадают в meta', () => {
        const { service, capture } = makeLogger();
        service.error(new Error('boom'), undefined, 'MyService');

        expect(capture.records[0].meta).toBeUndefined();
    });

    it('объект-сообщение сериализуется в JSON', () => {
        const { service, capture } = makeLogger();
        service.log({ dealId: 42 });

        expect(capture.records[0].message).toBe('{"dealId":42}');
    });

    it('fatal маппится на уровень error', () => {
        const { service, capture } = makeLogger();
        service.fatal('совсем плохо');

        expect(capture.records[0].level).toBe('error');
    });

    describe('интеграция с Telegram-транспортом', () => {
        it('при telegramLevel=error ошибка уходит в sink, а log — нет', () => {
            const sink = makeTelegramSink();
            const { service } = makeLogger({ telegramLevel: 'error' }, sink);

            service.log('обычный лог');
            service.error('ошибка');

            expect(sink.sendMessage).toHaveBeenCalledTimes(1);
            const text = sink.sendMessage.mock.calls[0][0];
            expect(text).toContain('ошибка');
        });

        it('при telegramLevel=none sink не вызывается даже для ошибок', () => {
            const sink = makeTelegramSink();
            const { service } = makeLogger({ telegramLevel: 'none' }, sink);

            service.error('ошибка');

            expect(sink.sendMessage).not.toHaveBeenCalled();
        });

        it('{ telegram: true } форсит отправку даже при telegramLevel=none', () => {
            const sink = makeTelegramSink();
            const { service, capture } = makeLogger(
                { telegramLevel: 'none' },
                sink,
            );

            service.warn('лимит почти исчерпан', {
                telegram: true,
                xo: 'x77',
            });

            expect(sink.sendMessage).toHaveBeenCalledTimes(1);
            expect(sink.sendMessage.mock.calls[0][0]).toContain(
                'лимит почти исчерпан',
            );
            // служебный флаг вырезан из meta, полезные поля остались
            expect(capture.records[0].meta).toEqual({ xo: 'x77' });
            expect(capture.records[0].telegram).toBe(true);
        });
    });
});
