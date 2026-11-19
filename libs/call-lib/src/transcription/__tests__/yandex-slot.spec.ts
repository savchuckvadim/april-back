import { YandexSlot } from '../provider/yandex-slot';
import { YandexSlotTimeoutError } from '../provider/yandex-submission.errors';

/** Слот Яндекса с пределом ожидания — чтобы ожидание укладывалось в таймаут задания. */
describe('YandexSlot', () => {
    afterEach(() => jest.useRealTimers());

    it('слот свободен — работа сразу', async () => {
        const slot = new YandexSlot(1, 1000);
        await expect(
            slot.run(() => Promise.resolve('ok'), 'звонок'),
        ).resolves.toBe('ok');
    });

    it('слот не освободился за предел — отказ; работа не начнётся и потом', async () => {
        jest.useFakeTimers();
        const slot = new YandexSlot(1, 1000);
        let releaseFirst: () => void = () => undefined;
        const first = slot.run(
            () => new Promise<void>(done => (releaseFirst = done)),
            'первый',
        );
        const late = jest.fn().mockResolvedValue('поздно');
        const second = slot.run(late, 'второй');
        const outcome = second.catch((error: unknown) => error);

        await jest.advanceTimersByTimeAsync(1001);
        const error = await outcome;
        expect(error).toBeInstanceOf(YandexSlotTimeoutError);
        expect((error as Error).message).toContain('звонок второй');

        releaseFirst();
        await first;
        await jest.advanceTimersByTimeAsync(10);
        expect(late).not.toHaveBeenCalled();
    });

    it('дождался слота до предела — работа выполняется', async () => {
        jest.useFakeTimers();
        const slot = new YandexSlot(1, 5000);
        let releaseFirst: () => void = () => undefined;
        const first = slot.run(
            () => new Promise<void>(done => (releaseFirst = done)),
            'первый',
        );
        const second = slot.run(() => Promise.resolve('второй'), 'второй');
        await jest.advanceTimersByTimeAsync(1000);
        releaseFirst();
        await first;
        await expect(second).resolves.toBe('второй');
    });

    it('предел 0 — ждёт без ограничения', async () => {
        const slot = new YandexSlot(1, 0);
        await expect(
            slot.run(() => Promise.resolve(1), 'звонок'),
        ).resolves.toBe(1);
    });
});
