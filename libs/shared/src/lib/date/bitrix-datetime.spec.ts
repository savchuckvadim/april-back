import { ETimeZone } from './timezone';
import { BitrixDateTime, nowCrmDateTime } from './bitrix-datetime';

describe('BitrixDateTime', () => {
    describe('toTaskDeadline (server-time Москва)', () => {
        it('Иркутск 02:14 → Москва 21:14 предыдущего дня', () => {
            const d = BitrixDateTime.fromPortalInput(
                '01.07.2026 02:14:00',
                ETimeZone.ASIA_IRKUTSK,
            );
            // 02:14 IRK (UTC+8) = 21:14 MSK (UTC+3) предыдущего дня
            expect(d.toTaskDeadline()).toBe('2026-06-30 21:14:00');
        });

        it('Новосибирск 10:00 → Москва 06:00', () => {
            const d = BitrixDateTime.fromPortalInput(
                '26.05.2026 10:00:00',
                ETimeZone.ASIA_NOVOSIBIRSK,
            );
            expect(d.toTaskDeadline()).toBe('2026-05-26 06:00:00');
        });

        it('Москва → Москва без сдвига', () => {
            const d = BitrixDateTime.fromPortalInput(
                '26.05.2026 10:00:00',
                ETimeZone.EUROPE_MOSCOW,
            );
            expect(d.toTaskDeadline()).toBe('2026-05-26 10:00:00');
        });
    });

    describe('toCrmDateTime (локаль портала)', () => {
        it('остаётся в TZ портала и нормализует формат', () => {
            const d = BitrixDateTime.fromPortalInput(
                '2026-05-26 09:30:00',
                ETimeZone.ASIA_IRKUTSK,
            );
            expect(d.toCrmDateTime()).toBe('26.05.2026 09:30:00');
        });

        it('тот же момент: задача в Москве, CRM в локали портала', () => {
            const d = BitrixDateTime.fromPortalInput(
                '01.07.2026 02:14:00',
                ETimeZone.ASIA_IRKUTSK,
            );
            expect(d.toCrmDateTime()).toBe('01.07.2026 02:14:00');
            expect(d.toTaskDeadline()).toBe('2026-06-30 21:14:00');
        });
    });

    describe('toRuHuman', () => {
        it('форматирует «26 мая 2026» без «г.»', () => {
            const d = BitrixDateTime.fromPortalInput(
                '26.05.2026 10:00:00',
                ETimeZone.EUROPE_MOSCOW,
            );
            expect(d.toRuHuman()).toBe('26 мая 2026');
        });

        it('сохраняет календарный день в TZ портала на полночь', () => {
            const d = BitrixDateTime.fromPortalInput(
                '2026-05-26',
                ETimeZone.ASIA_NOVOSIBIRSK,
            );
            expect(d.toRuHuman()).toBe('26 мая 2026');
        });
    });

    describe('toRuHumanDateTime', () => {
        it('форматирует «28 мая 14:30» (без года) в TZ портала', () => {
            const d = BitrixDateTime.fromPortalInput(
                '28.05.2026 14:30:00',
                ETimeZone.EUROPE_MOSCOW,
            );
            expect(d.toRuHumanDateTime()).toBe('28 мая 14:30');
        });

        it('тот же момент в TZ портала, а не сервера', () => {
            const d = BitrixDateTime.fromPortalInput(
                '01.07.2026 02:14:00',
                ETimeZone.ASIA_IRKUTSK,
            );
            expect(d.toRuHumanDateTime()).toBe('1 июля 02:14');
        });
    });

    describe('fromPortalInput', () => {
        it('кидает Error на нераспознанный формат', () => {
            expect(() =>
                BitrixDateTime.fromPortalInput(
                    'not-a-date',
                    ETimeZone.EUROPE_MOSCOW,
                ),
            ).toThrow(/parsePortalInput/);
        });

        it('сохраняет TZ портала', () => {
            const d = BitrixDateTime.fromPortalInput(
                '26.05.2026 10:00:00',
                ETimeZone.ASIA_IRKUTSK,
            );
            expect(d.getPortalTimezone()).toBe(ETimeZone.ASIA_IRKUTSK);
        });
    });

    describe('nowCrmDateTime', () => {
        it('возвращает строку формата DD.MM.YYYY HH:mm:ss', () => {
            expect(nowCrmDateTime(ETimeZone.EUROPE_MOSCOW)).toMatch(
                /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$/,
            );
        });
    });
});
