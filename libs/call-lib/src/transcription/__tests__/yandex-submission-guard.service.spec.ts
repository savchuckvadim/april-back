import { Logger } from '@nestjs/common';
import {
    YANDEX_OPERATION_TTL_SEC,
    YANDEX_SUBMIT_WINDOW_SEC,
    yandexGuardKeys,
    type YandexCallRef,
} from '../provider/yandex-submission-guard.service';
import {
    YandexCallBusyError,
    YandexSubmitLimitError,
} from '../provider/yandex-submission.errors';
import { YANDEX_SUBMISSIONS_TTL_SEC } from '../repository/yandex-submission-stats.repository';
import { makeGuard } from './yandex-fake-redis.fixture';

/**
 * Страж платных отправок в Яндекс (19.11.2026: за 30 дней 520 отправок
 * при ~170 звонках — один звонок оплачивался по нескольку раз).
 */
const CALL: YandexCallRef = {
    key: 'gsr.bitrix24.ru:101',
    domain: 'gsr.bitrix24.ru',
    label: 'gsr.bitrix24.ru:101 (call.mp3)',
    durationSec: 700,
};

const SPEC = { channels: 1 as const, objectKey: 'transcription/audio/x.mp3' };

/** Обещание, которое тест разрешает сам — «долгое распознавание». */
const deferred = (): { promise: Promise<void>; resolve: () => void } => {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>(done => {
        resolve = done;
    });
    return { promise, resolve };
};

describe('YandexSubmissionGuard', () => {
    let warn: jest.SpyInstance;
    let log: jest.SpyInstance;

    beforeEach(() => {
        warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        log = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);
    });

    afterEach(() => jest.restoreAllMocks());

    describe('замок звонка', () => {
        it('второй запуск того же звонка, пока идёт первый, — отказ без работы', async () => {
            const { guard } = makeGuard();
            const first = deferred();
            const running = guard.withCallLock(CALL, () => first.promise);
            const secondWork = jest.fn().mockResolvedValue('x');

            await expect(
                guard.withCallLock(CALL, secondWork),
            ).rejects.toBeInstanceOf(YandexCallBusyError);
            expect(secondWork).not.toHaveBeenCalled();

            first.resolve();
            await running;
        });

        it('после окончания первого запуска замок снят — звонок снова можно распознавать', async () => {
            const { guard, redis } = makeGuard();
            await guard.withCallLock(CALL, () => Promise.resolve('готово'));
            expect(redis.values.has(yandexGuardKeys.lock(CALL.key))).toBe(
                false,
            );
            await expect(
                guard.withCallLock(CALL, () => Promise.resolve('снова')),
            ).resolves.toBe('снова');
        });

        it('замок снимается и при ошибке работы', async () => {
            const { guard, redis } = makeGuard();
            await expect(
                guard.withCallLock(CALL, () =>
                    Promise.reject(new Error('сбой')),
                ),
            ).rejects.toThrow('сбой');
            expect(redis.values.has(yandexGuardKeys.lock(CALL.key))).toBe(
                false,
            );
        });

        it('замок другого звонка не мешает', async () => {
            const { guard } = makeGuard();
            const first = deferred();
            const running = guard.withCallLock(CALL, () => first.promise);
            await expect(
                guard.withCallLock(
                    { ...CALL, key: 'gsr.bitrix24.ru:202' },
                    () => Promise.resolve('другой'),
                ),
            ).resolves.toBe('другой');
            first.resolve();
            await running;
        });

        it('долгое распознавание продлевает замок', async () => {
            jest.useFakeTimers();
            try {
                const { guard, redis } = makeGuard();
                const first = deferred();
                const running = guard.withCallLock(CALL, () => first.promise);
                await Promise.resolve();
                await jest.advanceTimersByTimeAsync(130_000);
                const renewals = redis.eval.mock.calls.filter(call =>
                    String(call[0]).includes("'expire'"),
                );
                expect(renewals.length).toBeGreaterThanOrEqual(1);
                first.resolve();
                await running;
            } finally {
                jest.useRealTimers();
            }
        });
    });

    describe('лимит отправок', () => {
        it('три отправки проходят, четвёртая — отказ без отправки и одна тревога в Telegram', async () => {
            const { guard, redis } = makeGuard();
            const send = jest.fn().mockResolvedValue('op');

            for (let i = 0; i < 3; i++) {
                await guard.submit(CALL, SPEC, send);
            }
            await expect(guard.submit(CALL, SPEC, send)).rejects.toBeInstanceOf(
                YandexSubmitLimitError,
            );
            await expect(guard.submit(CALL, SPEC, send)).rejects.toThrow(
                'отправлялся в Яндекс 3 раза',
            );

            expect(send).toHaveBeenCalledTimes(3);
            const alerts = (warn.mock.calls as unknown[][]).filter(
                ([, meta]) =>
                    (meta as { telegram?: boolean } | undefined)?.telegram,
            );
            expect(alerts).toHaveLength(1);
            expect(String(alerts[0][0])).toContain(
                'отправлялся в Яндекс 3 раза за 72 ч — остановлено, нужна проверка',
            );
            expect(redis.ttl.get(yandexGuardKeys.sends(CALL.key))).toBe(
                YANDEX_SUBMIT_WINDOW_SEC,
            );
        });

        it('сбой отправки тоже попытка: после трёх отказов Яндекса четвёртой нет', async () => {
            const { guard } = makeGuard();
            const send = jest.fn().mockRejectedValue(new Error('HTTP 403'));
            for (let i = 0; i < 3; i++) {
                await expect(guard.submit(CALL, SPEC, send)).rejects.toThrow(
                    'HTTP 403',
                );
            }
            await expect(guard.submit(CALL, SPEC, send)).rejects.toBeInstanceOf(
                YandexSubmitLimitError,
            );
            expect(send).toHaveBeenCalledTimes(3);
        });

        it('лимит — на звонок: другой звонок отправляется', async () => {
            const { guard } = makeGuard();
            const send = jest.fn().mockResolvedValue('op');
            for (let i = 0; i < 3; i++) {
                await guard.submit(CALL, SPEC, send);
            }
            await expect(
                guard.submit(
                    { ...CALL, key: 'gsr.bitrix24.ru:202' },
                    SPEC,
                    send,
                ),
            ).resolves.toBe('op');
        });
    });

    describe('номер операции', () => {
        it('сохраняется сразу после отправки на 24 ч, вместе с каналами и записью', async () => {
            const { guard, redis } = makeGuard();
            await guard.submit(CALL, { ...SPEC, channels: 2 }, () =>
                Promise.resolve('op-7'),
            );
            await expect(guard.storedOperation(CALL)).resolves.toEqual({
                operationId: 'op-7',
                channels: 2,
                objectKey: SPEC.objectKey,
            });
            expect(redis.ttl.get(yandexGuardKeys.operation(CALL.key))).toBe(
                YANDEX_OPERATION_TTL_SEC,
            );
            expect(log).toHaveBeenCalledWith(
                'Яндекс принял операцию op-7 для gsr.bitrix24.ru:101 (call.mp3) (700 с, попытка 1 из 3)',
            );
        });

        it('забытая операция больше не возвращается; мусор в ключе — как нет операции', async () => {
            const { guard, redis } = makeGuard();
            await guard.submit(CALL, SPEC, () => Promise.resolve('op-1'));
            await guard.forgetOperation(CALL);
            await expect(guard.storedOperation(CALL)).resolves.toBeNull();

            redis.values.set(yandexGuardKeys.operation(CALL.key), '{битый');
            await expect(guard.storedOperation(CALL)).resolves.toBeNull();
        });

        it('сбой записи номера не роняет принятую отправку — только предупреждение', async () => {
            const { guard, redis } = makeGuard();
            redis.set.mockRejectedValueOnce(new Error('redis down'));
            await expect(
                guard.submit(CALL, SPEC, () => Promise.resolve('op-1')),
            ).resolves.toBe('op-1');
            expect(warn).toHaveBeenCalledWith(
                expect.stringContaining('Номер операции op-1'),
            );
        });
    });

    describe('счётчик отправок для страницы расхода', () => {
        it('принятая отправка — +1 и секунды звонка в хэш дня по Москве, срок 120 суток', async () => {
            jest.useFakeTimers({ now: new Date('2026-11-19T22:30:00Z') });
            try {
                const { guard, redis } = makeGuard();
                await guard.submit(CALL, SPEC, () => Promise.resolve('op-1'));
                await guard.submit(CALL, SPEC, () => Promise.resolve('op-2'));

                // 22:30 UTC — уже 20.11 по Москве.
                const key = 'yandex-stt:submissions:2026-11-20';
                const hash = redis.hashes.get(key);
                expect(hash?.get('gsr.bitrix24.ru|n')).toBe(2);
                expect(hash?.get('gsr.bitrix24.ru|sec')).toBe(1400);
                expect(redis.ttl.get(key)).toBe(YANDEX_SUBMISSIONS_TTL_SEC);
            } finally {
                jest.useRealTimers();
            }
        });

        it('отказ Яндекса и отказ по лимиту в счётчик расхода не попадают', async () => {
            const { guard, redis } = makeGuard();
            await expect(
                guard.submit(CALL, SPEC, () =>
                    Promise.reject(new Error('HTTP 403')),
                ),
            ).rejects.toThrow('HTTP 403');
            expect(redis.hashes.size).toBe(0);
        });
    });
});
