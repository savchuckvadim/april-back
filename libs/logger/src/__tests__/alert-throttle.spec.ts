import { ALERT_THROTTLE_WINDOW_MS, AlertThrottle } from '../alert-throttle';

describe('AlertThrottle', () => {
    const START = 1_700_000_000_000;

    it('первое оповещение по ключу проходит, повтор в окне — нет', () => {
        const throttle = new AlertThrottle();
        expect(throttle.allow('gigachat:tokens-limit', START)).toBe(true);
        expect(throttle.allow('gigachat:tokens-limit', START + 1)).toBe(false);
        expect(
            throttle.allow(
                'gigachat:tokens-limit',
                START + ALERT_THROTTLE_WINDOW_MS - 1,
            ),
        ).toBe(false);
    });

    it('после окна оповещение снова проходит', () => {
        const throttle = new AlertThrottle();
        throttle.allow('key', START);
        expect(throttle.allow('key', START + ALERT_THROTTLE_WINDOW_MS)).toBe(
            true,
        );
    });

    it('окно по умолчанию — полчаса', () => {
        expect(ALERT_THROTTLE_WINDOW_MS).toBe(30 * 60 * 1000);
    });

    it('разные причины не глушат друг друга', () => {
        const throttle = new AlertThrottle();
        expect(throttle.allow('rag:resume:tokens-limit', START)).toBe(true);
        // Другая причина того же сервиса — отдельный счётчик: редкая
        // авария не должна вытесняться частым шумом.
        expect(throttle.allow('rag:resume:unauthorized', START)).toBe(true);
        expect(throttle.allow('rag:recomendation:tokens-limit', START)).toBe(
            true,
        );
    });

    it('окно настраивается', () => {
        const throttle = new AlertThrottle(1000);
        throttle.allow('key', START);
        expect(throttle.allow('key', START + 999)).toBe(false);
        expect(throttle.allow('key', START + 1000)).toBe(true);
    });

    it('reset забывает ключ — сервис снова отвечает', () => {
        const throttle = new AlertThrottle();
        throttle.allow('key', START);
        throttle.reset('key');
        expect(throttle.allow('key', START + 1)).toBe(true);
    });

    it('протухшие ключи вычищаются, счётчик не растёт бесконечно', () => {
        const throttle = new AlertThrottle(1000);
        for (let i = 0; i < 50; i += 1) {
            throttle.allow(`key-${i}`, START);
        }
        expect(throttle.size()).toBe(50);
        // Новый вызов за пределами окна чистит всё старое.
        throttle.allow('fresh', START + 5000);
        expect(throttle.size()).toBe(1);
    });
});
