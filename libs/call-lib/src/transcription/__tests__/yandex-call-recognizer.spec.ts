import {
    YandexCallRecognizer,
    type YandexCallInput,
} from '../provider/yandex-call-recognizer';
import { yandexGuardKeys } from '../provider/yandex-submission-guard.service';
import {
    YandexCallBusyError,
    YandexSubmitLimitError,
} from '../provider/yandex-submission.errors';
import {
    YandexOperationFailedError,
    YandexOperationPendingError,
    YandexSttHttpError,
} from '../services/streaming-transcription.service';
import { makeGuard } from './yandex-fake-redis.fixture';

/**
 * Yandex-путь под стражем (19.11.2026): продолжение сохранённой операции
 * вместо повторной оплаты, удаление записи после ответа Яндекса, повтор
 * с другим числом каналов — тоже через лимит.
 */
const OBJECT_KEY = 'transcription/audio/gsr.bitrix24.ru/call-report/call.mp3';
const RESULT = { text: 'Добрый день', segments: [] };

const makeInput = (channels: 1 | 2 | null = null) => {
    const upload = jest.fn().mockResolvedValue({
        objectKey: OBJECT_KEY,
        uri: 'https://s3/call.mp3',
    });
    const input: YandexCallInput = {
        call: {
            key: 'gsr.bitrix24.ru:101',
            domain: 'gsr.bitrix24.ru',
            label: 'gsr.bitrix24.ru:101 (call.mp3)',
            durationSec: 700,
        },
        channels,
        upload,
    };
    return { input, upload };
};

const makeRecognizer = () => {
    const { guard, redis } = makeGuard();
    const yandex = {
        transcribeAudio: jest.fn().mockResolvedValue('op-1'),
        getTranscriptionDetailed: jest.fn().mockResolvedValue(RESULT),
    };
    const storage = { deleteFile: jest.fn().mockResolvedValue(undefined) };
    const logger = { log: jest.fn(), warn: jest.fn() };
    const recognizer = new YandexCallRecognizer({
        storage,
        yandex,
        guard,
        logger,
    });
    return { recognizer, guard, redis, yandex, storage, logger };
};

const sendsOf = (redis: ReturnType<typeof makeGuard>['redis']): number =>
    Number(redis.values.get(yandexGuardKeys.sends('gsr.bitrix24.ru:101')));

describe('YandexCallRecognizer', () => {
    it('обычный путь: загрузка, отправка через стража, результат, запись удалена', async () => {
        const { recognizer, yandex, storage, redis } = makeRecognizer();
        const { input, upload } = makeInput(2);

        await expect(recognizer.recognize(input)).resolves.toEqual(RESULT);

        expect(upload).toHaveBeenCalledTimes(1);
        expect(yandex.transcribeAudio).toHaveBeenCalledWith(
            'https://s3/call.mp3',
            2,
        );
        expect(sendsOf(redis)).toBe(1);
        expect(storage.deleteFile).toHaveBeenCalledWith(OBJECT_KEY);
    });

    describe('продолжение сохранённой операции', () => {
        it('таймаут опроса — следующий запуск ждёт ту же операцию, а не отправляет звонок заново', async () => {
            const { recognizer, yandex, storage, redis, logger } =
                makeRecognizer();
            yandex.getTranscriptionDetailed
                .mockRejectedValueOnce(
                    new YandexOperationPendingError('не завершил'),
                )
                .mockResolvedValueOnce(RESULT);
            const first = makeInput();

            await expect(recognizer.recognize(first.input)).rejects.toThrow(
                'не завершил',
            );
            // Операция может ещё идти — запись ей нужна.
            expect(storage.deleteFile).not.toHaveBeenCalled();

            const second = makeInput();
            await expect(recognizer.recognize(second.input)).resolves.toEqual(
                RESULT,
            );
            expect(yandex.transcribeAudio).toHaveBeenCalledTimes(1);
            expect(second.upload).not.toHaveBeenCalled();
            expect(yandex.getTranscriptionDetailed).toHaveBeenLastCalledWith(
                'op-1',
            );
            expect(sendsOf(redis)).toBe(1);
            expect(logger.log).toHaveBeenCalledWith(
                expect.stringContaining('Продолжаю ждать операцию op-1'),
            );
            expect(storage.deleteFile).toHaveBeenCalledWith(OBJECT_KEY);
        });

        it('успех тоже помнится: повторный запуск забирает результат той же операции бесплатно', async () => {
            const { recognizer, yandex } = makeRecognizer();
            await recognizer.recognize(makeInput().input);
            await recognizer.recognize(makeInput().input);
            expect(yandex.transcribeAudio).toHaveBeenCalledTimes(1);
            expect(yandex.getTranscriptionDetailed).toHaveBeenCalledTimes(2);
        });

        it('Яндекс не знает операцию (404) — номер забыт, звонок отправляется заново в пределах лимита', async () => {
            const { recognizer, guard, yandex, redis } = makeRecognizer();
            const { input, upload } = makeInput();
            await guard.submit(
                input.call,
                { channels: 1, objectKey: OBJECT_KEY },
                () => Promise.resolve('op-old'),
            );
            yandex.getTranscriptionDetailed.mockRejectedValueOnce(
                new YandexSttHttpError(404, null, 'poll', 'HTTP 404'),
            );
            yandex.transcribeAudio.mockResolvedValueOnce('op-new');

            await expect(recognizer.recognize(input)).resolves.toEqual(RESULT);

            expect(upload).toHaveBeenCalledTimes(1);
            expect(yandex.transcribeAudio).toHaveBeenCalledTimes(1);
            expect(sendsOf(redis)).toBe(2);
            await expect(guard.storedOperation(input.call)).resolves.toEqual(
                expect.objectContaining({ operationId: 'op-new' }),
            );
        });

        it('сохранённая операция завершилась ошибкой Яндекса — отправка заново', async () => {
            const { recognizer, guard, yandex } = makeRecognizer();
            const { input } = makeInput();
            await guard.submit(
                input.call,
                { channels: 1, objectKey: OBJECT_KEY },
                () => Promise.resolve('op-old'),
            );
            yandex.getTranscriptionDetailed.mockRejectedValueOnce(
                new YandexOperationFailedError('Яндекс завершил операцию'),
            );

            await expect(recognizer.recognize(input)).resolves.toEqual(RESULT);
            expect(yandex.transcribeAudio).toHaveBeenCalledTimes(1);
        });

        it('пустая расшифровка сохранённой операции — ошибка без новой оплаты', async () => {
            const { recognizer, guard, yandex } = makeRecognizer();
            const { input } = makeInput();
            await guard.submit(
                input.call,
                { channels: 1, objectKey: OBJECT_KEY },
                () => Promise.resolve('op-old'),
            );
            yandex.getTranscriptionDetailed.mockRejectedValueOnce(
                new Error('Яндекс вернул пустую расшифровку'),
            );

            await expect(recognizer.recognize(input)).rejects.toThrow(
                'пустую расшифровку',
            );
            expect(yandex.transcribeAudio).not.toHaveBeenCalled();
        });
    });

    describe('удаление записи из Object Storage', () => {
        it('окончательная ошибка Яндекса — запись удалена', async () => {
            const { recognizer, yandex, storage } = makeRecognizer();
            yandex.getTranscriptionDetailed.mockRejectedValueOnce(
                new Error('Яндекс вернул пустую расшифровку'),
            );
            await expect(
                recognizer.recognize(makeInput().input),
            ).rejects.toThrow('пустую');
            expect(storage.deleteFile).toHaveBeenCalledWith(OBJECT_KEY);
        });

        it('серия сбоев опроса (операция жива) — запись остаётся', async () => {
            const { recognizer, yandex, storage } = makeRecognizer();
            yandex.getTranscriptionDetailed.mockRejectedValueOnce(
                new YandexSttHttpError(500, null, 'poll', 'HTTP 500'),
            );
            await expect(
                recognizer.recognize(makeInput().input),
            ).rejects.toThrow('HTTP 500');
            expect(storage.deleteFile).not.toHaveBeenCalled();
        });

        it('ошибка удаления — только предупреждение, результат возвращается', async () => {
            const { recognizer, storage, logger } = makeRecognizer();
            storage.deleteFile.mockRejectedValueOnce(new Error('S3 503'));
            await expect(
                recognizer.recognize(makeInput().input),
            ).resolves.toEqual(RESULT);
            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('не удалена из Object Storage: S3 503'),
            );
        });
    });

    describe('повтор с другим числом каналов', () => {
        const mismatch = () =>
            new YandexOperationFailedError(
                'Яндекс завершил операцию op-1 ошибкой: 3 Audio has 2 channels, but 1 requested in specification',
            );

        it('идёт через стража: обе отправки учтены, номер — у второй операции', async () => {
            const { recognizer, guard, yandex, redis } = makeRecognizer();
            yandex.transcribeAudio
                .mockResolvedValueOnce('op-1')
                .mockResolvedValueOnce('op-2');
            yandex.getTranscriptionDetailed
                .mockRejectedValueOnce(mismatch())
                .mockResolvedValueOnce(RESULT);
            const { input } = makeInput(1);

            await expect(recognizer.recognize(input)).resolves.toEqual(RESULT);
            expect(yandex.transcribeAudio).toHaveBeenNthCalledWith(
                2,
                'https://s3/call.mp3',
                2,
            );
            expect(sendsOf(redis)).toBe(2);
            await expect(guard.storedOperation(input.call)).resolves.toEqual(
                expect.objectContaining({ operationId: 'op-2', channels: 2 }),
            );
        });

        it('лимит исчерпан — повтор не отправляется', async () => {
            const { recognizer, guard, yandex } = makeRecognizer();
            const { input } = makeInput(1);
            const send = () => Promise.resolve('op-x');
            await guard.submit(
                input.call,
                { channels: 1, objectKey: null },
                send,
            );
            await guard.submit(
                input.call,
                { channels: 1, objectKey: null },
                send,
            );
            await guard.forgetOperation(input.call);
            yandex.getTranscriptionDetailed.mockRejectedValueOnce(mismatch());

            await expect(recognizer.recognize(input)).rejects.toBeInstanceOf(
                YandexSubmitLimitError,
            );
            expect(yandex.transcribeAudio).toHaveBeenCalledTimes(1);
        });
    });

    it('звонок уже распознаётся — отказ до загрузки и отправки', async () => {
        const { recognizer, guard, yandex } = makeRecognizer();
        const { input, upload } = makeInput();
        let release: () => void = () => undefined;
        const running = guard.withCallLock(
            input.call,
            () => new Promise<void>(done => (release = done)),
        );

        await expect(recognizer.recognize(input)).rejects.toBeInstanceOf(
            YandexCallBusyError,
        );
        expect(upload).not.toHaveBeenCalled();
        expect(yandex.transcribeAudio).not.toHaveBeenCalled();
        release();
        await running;
    });

    it('замок берётся до ожидания слота: слот получает уже защищённую работу', async () => {
        const { guard, redis, yandex, storage, logger } = makeRecognizer();
        const order: string[] = [];
        const lockKey = yandexGuardKeys.lock('gsr.bitrix24.ru:101');
        const slot = {
            run<T>(work: () => Promise<T>, label: string): Promise<T> {
                order.push(
                    `${redis.values.has(lockKey) ? 'после замка' : 'до замка'}: ${label}`,
                );
                return work();
            },
        };
        const recognizer = new YandexCallRecognizer({
            storage,
            yandex,
            guard,
            logger,
            slot,
        });
        await recognizer.recognize(makeInput().input);
        expect(order).toEqual(['после замка: gsr.bitrix24.ru:101 (call.mp3)']);
    });
});
