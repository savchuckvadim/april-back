import { previousMoscowDay } from '../call-reviews-digest.window';

describe('previousMoscowDay', () => {
    it('в 09:00 МСК — прошлые сутки по Москве: с 00:00 до 24:00', () => {
        expect(previousMoscowDay(new Date('2026-11-19T06:00:00.000Z'))).toEqual(
            {
                day: '2026-11-18',
                from: new Date('2026-11-17T21:00:00.000Z'),
                to: new Date('2026-11-18T21:00:00.000Z'),
            },
        );
    });

    it('сразу после полуночи по Москве (ещё вчера по UTC) — уже новые сутки', () => {
        expect(
            previousMoscowDay(new Date('2026-11-18T21:30:00.000Z')).day,
        ).toBe('2026-11-18');
        expect(
            previousMoscowDay(new Date('2026-11-18T20:59:00.000Z')).day,
        ).toBe('2026-11-17');
    });

    it('первое число — прошлый день прошлого месяца', () => {
        expect(
            previousMoscowDay(new Date('2026-12-01T06:00:00.000Z')).day,
        ).toBe('2026-11-30');
    });
});
