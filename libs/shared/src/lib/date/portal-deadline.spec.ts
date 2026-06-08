import { ETimeZone } from './timezone';
import { PortalDeadline, nowCrmDateTime } from './portal-deadline';

describe('PortalDeadline', () => {
    describe('toTaskDeadline (server-time Москва)', () => {
        it('Иркутск 02:14 → Москва 21:14 предыдущего дня', () => {
            const d = PortalDeadline.fromPortalInput(
                '01.07.2026 02:14:00',
                ETimeZone.ASIA_IRKUTSK,
            );
            // 02:14 IRK (UTC+8) = 21:14 MSK (UTC+3) предыдущего дня
            expect(d.toTaskDeadline()).toBe('2026-06-30 21:14:00');
        });

        it('Новосибирск 10:00 → Москва 06:00', () => {
            const d = PortalDeadline.fromPortalInput(
                '26.05.2026 10:00:00',
                ETimeZone.ASIA_NOVOSIBIRSK,
            );
            expect(d.toTaskDeadline()).toBe('2026-05-26 06:00:00');
        });

        it('Москва → Москва без сдвига', () => {
            const d = PortalDeadline.fromPortalInput(
                '26.05.2026 10:00:00',
                ETimeZone.EUROPE_MOSCOW,
            );
            expect(d.toTaskDeadline()).toBe('2026-05-26 10:00:00');
        });
    });

    describe('toCrmDateTime (локаль портала)', () => {
        it('остаётся в TZ портала и нормализует формат', () => {
            const d = PortalDeadline.fromPortalInput(
                '2026-05-26 09:30:00',
                ETimeZone.ASIA_IRKUTSK,
            );
            expect(d.toCrmDateTime()).toBe('26.05.2026 09:30:00');
        });

        it('тот же момент: задача в Москве, CRM в локали портала', () => {
            const d = PortalDeadline.fromPortalInput(
                '01.07.2026 02:14:00',
                ETimeZone.ASIA_IRKUTSK,
            );
            expect(d.toCrmDateTime()).toBe('01.07.2026 02:14:00');
            expect(d.toTaskDeadline()).toBe('2026-06-30 21:14:00');
        });
    });

    describe('toRuHuman', () => {
        it('форматирует «26 мая 2026» без «г.»', () => {
            const d = PortalDeadline.fromPortalInput(
                '26.05.2026 10:00:00',
                ETimeZone.EUROPE_MOSCOW,
            );
            expect(d.toRuHuman()).toBe('26 мая 2026');
        });

        it('сохраняет календарный день в TZ портала на полночь', () => {
            const d = PortalDeadline.fromPortalInput(
                '2026-05-26',
                ETimeZone.ASIA_NOVOSIBIRSK,
            );
            expect(d.toRuHuman()).toBe('26 мая 2026');
        });
    });

    describe('fromPortalInput', () => {
        it('кидает Error на нераспознанный формат', () => {
            expect(() =>
                PortalDeadline.fromPortalInput(
                    'not-a-date',
                    ETimeZone.EUROPE_MOSCOW,
                ),
            ).toThrow(/parsePortalInput/);
        });

        it('сохраняет TZ портала', () => {
            const d = PortalDeadline.fromPortalInput(
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
