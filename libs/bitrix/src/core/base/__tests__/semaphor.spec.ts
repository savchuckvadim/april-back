import { Semaphore } from '../semaphor';

/** Сколько раз подряд можно взять слот, не дожидаясь освобождения. */
const freeSlots = async (
    semaphore: Semaphore,
    max: number,
): Promise<number> => {
    let taken = 0;
    for (let i = 0; i < max; i += 1) {
        let granted = false;
        void semaphore.acquire().then(() => {
            granted = true;
        });
        await Promise.resolve();
        if (!granted) break;
        taken += 1;
    }
    return taken;
};

describe('Semaphore', () => {
    it('пускает не больше заданного числа одновременно', async () => {
        const semaphore = new Semaphore(2);

        expect(await freeSlots(semaphore, 5)).toBe(2);
    });

    it('освобождённый слот переходит ждущему', async () => {
        const semaphore = new Semaphore(1);
        await semaphore.acquire();
        let woken = false;
        void semaphore.acquire().then(() => {
            woken = true;
        });
        await Promise.resolve();
        expect(woken).toBe(false);

        semaphore.release();
        // Разбуженному нужно несколько тиков: продолжение acquire, затем
        // его then — ждём завершения очереди микрозадач целиком.
        await new Promise(resolve => setImmediate(resolve));

        expect(woken).toBe(true);
    });

    it('предел не растягивается после очереди ждущих', async () => {
        // Раньше release всегда увеличивал счётчик, а разбуженный ждущий его
        // не уменьшал: после каждой очереди свободных слотов становилось
        // на один больше заданного.
        const semaphore = new Semaphore(1);
        await semaphore.acquire();
        const waiter = semaphore.acquire();
        semaphore.release(); // слот перешёл ждущему
        await waiter;
        semaphore.release(); // ждущий отпустил — свободен ровно один слот

        expect(await freeSlots(semaphore, 5)).toBe(1);
    });
});
