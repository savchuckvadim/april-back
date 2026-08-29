import { AppCacheService } from '@lib/app-cache';
import {
    SideFlowGuardService,
    SideFlowRunRef,
} from '../side-flow-guard.service';

/**
 * Гейт повторной доставки сайд-джобов.
 *
 * Главное правило раздела: отметка ставится ДО работы (`begin`) и только
 * подтверждается исходом (`complete`). Отметка ПОСЛЕ записи в Битрикс
 * оставляла бы окно ровно на тот сценарий, ради которого гейт заведён, —
 * упавший внутри него воркер давал дубль элемента.
 */
const makeHarness = (over?: {
    stored?: Record<string, unknown> | null;
    getFails?: boolean;
    setFails?: boolean;
}) => {
    const writes: Array<{ key: string; data: unknown; ttlSeconds?: number }> =
        [];
    const reads: string[] = [];

    const cache = {
        get: ({ key }: { key: string }) => {
            reads.push(key);
            if (over?.getFails) return Promise.reject(new Error('redis лёг'));
            return Promise.resolve(over?.stored ?? null);
        },
        set: ({
            key,
            data,
            ttlSeconds,
        }: {
            key: string;
            data: unknown;
            ttlSeconds?: number;
        }) => {
            if (over?.setFails) return Promise.reject(new Error('redis лёг'));
            writes.push({ key, data, ttlSeconds });
            return Promise.resolve({});
        },
    } as unknown as AppCacheService;

    const guard = new SideFlowGuardService(cache);
    jest.spyOn(guard['logger'], 'warn').mockImplementation(() => undefined);
    return { guard, writes, reads };
};

const ref: SideFlowRunRef = {
    domain: 'x.bitrix24.ru',
    flow: 'pres-flow',
    operationId: 'op-1',
    kind: 'report',
};

describe('SideFlowGuardService', () => {
    it('begin занимает прогон незавершённой отметкой', async () => {
        const { guard, writes } = makeHarness();
        await guard.begin(ref);

        expect(writes).toHaveLength(1);
        expect(writes[0].key).toBe('pres-flow:op-1:report');
        expect(writes[0].data).toMatchObject({
            status: 'started',
            action: null,
            elementId: null,
        });
        // Сутки: отчёт мог уехать в пятницу вечером.
        expect(writes[0].ttlSeconds).toBe(24 * 60 * 60);
    });

    it('complete подтверждает прогон исходом', async () => {
        const { guard, writes } = makeHarness();
        await guard.complete(ref, { action: 'closed', elementId: 601 });

        expect(writes[0].data).toMatchObject({
            status: 'done',
            action: 'closed',
            elementId: 601,
        });
    });

    it('незавершённая отметка так и читается — прогон исхода не подтвердил', async () => {
        const { guard } = makeHarness({
            stored: {
                status: 'started',
                action: null,
                elementId: null,
                at: '2026-08-29T09:00:00.000Z',
            },
        });

        expect(await guard.recall(ref)).toMatchObject({ status: 'started' });
    });

    /*
     * В кэше на момент деплоя лежат отметки суточной давности старой
     * формы — их писали ТОЛЬКО после успешной работы. Объявить их
     * незавершёнными значило бы молча запретить работу живым повторам.
     */
    it('отметка старой формы (без status) читается как завершённая', async () => {
        const { guard } = makeHarness({
            stored: {
                action: 'closed',
                elementId: 601,
                at: '2026-08-28T10:00:00.000Z',
            },
        });

        expect(await guard.recall(ref)).toEqual({
            status: 'done',
            action: 'closed',
            elementId: 601,
            at: '2026-08-28T10:00:00.000Z',
        });
    });

    it('отметки нет — прогон первый', async () => {
        const { guard } = makeHarness();
        expect(await guard.recall(ref)).toBeNull();
    });

    it('джоб без operationId: гейт выключен, кэш не трогаем вовсе', async () => {
        const { guard, writes, reads } = makeHarness();
        const legacy: SideFlowRunRef = { ...ref, operationId: undefined };

        expect(await guard.recall(legacy)).toBeNull();
        await guard.begin(legacy);
        await guard.complete(legacy, { action: 'closed', elementId: 1 });

        expect(reads).toHaveLength(0);
        expect(writes).toHaveLength(0);
    });

    /*
     * Правило раздела: потерять элемент из-за упавшего Redis хуже, чем
     * рискнуть дублем. Ни чтение, ни запись отметки джоб не роняют.
     */
    it('кэш лёг на чтении — гейт просто не срабатывает', async () => {
        const { guard } = makeHarness({ getFails: true });
        expect(await guard.recall(ref)).toBeNull();
    });

    it('кэш лёг на записи — джоб не падает', async () => {
        const { guard } = makeHarness({ setFails: true });
        await expect(guard.begin(ref)).resolves.toBeUndefined();
        await expect(
            guard.complete(ref, { action: 'closed', elementId: 601 }),
        ).resolves.toBeUndefined();
    });
});
