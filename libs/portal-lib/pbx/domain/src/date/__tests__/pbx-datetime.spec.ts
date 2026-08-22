import { ETimeZone } from '@lib/shared/lib/date';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBXDateTime } from '../pbx-datetime';

/**
 * PBXDateTime — обёртка над BitrixDateTime, которая берёт TZ из портала.
 *
 * Главное, что должен закрыть тест: TZ приходит ИЗ ПОРТАЛА, а не из машины,
 * и строка трактуется как локальное время портала, тогда как `Date` — как
 * готовый абсолютный момент. Раньше вызывающие писали
 * `dayjs(...).tz(portal.getTimezone()).format('DD.MM.YYYY HH:mm:ss')` руками,
 * и на не-московских порталах время разъезжалось.
 */
const portalWithTz = (tz: ETimeZone): PortalModel =>
    ({ getTimezone: () => tz }) as unknown as PortalModel;

const moscow = () => new PBXDateTime(portalWithTz(ETimeZone.EUROPE_MOSCOW));
const irkutsk = () => new PBXDateTime(portalWithTz(ETimeZone.ASIA_IRKUTSK));

describe('PBXDateTime', () => {
    it('отдаёт таймзону портала', () => {
        expect(moscow().timezone).toBe(ETimeZone.EUROPE_MOSCOW);
        expect(irkutsk().timezone).toBe(ETimeZone.ASIA_IRKUTSK);
    });

    describe('сырой ввод — локальное время портала', () => {
        it('CRM datetime сохраняет настенное время ввода', () => {
            expect(moscow().crmDateTime('01.07.2026 02:14:00')).toBe(
                '01.07.2026 02:14:00',
            );
            // Иркутск (+8): те же цифры на входе — те же на выходе.
            expect(irkutsk().crmDateTime('01.07.2026 02:14:00')).toBe(
                '01.07.2026 02:14:00',
            );
        });

        /*
         * DEADLINE задач Bitrix хранит в server-time (Москва), поэтому для
         * иркутского портала настенное время обязано сдвинуться на -5 часов.
         */
        it('DEADLINE задачи переводится в московское server-time', () => {
            expect(moscow().taskDeadline('01.07.2026 10:00:00')).toBe(
                '2026-07-01 10:00:00',
            );
            expect(irkutsk().taskDeadline('01.07.2026 10:00:00')).toBe(
                '2026-07-01 05:00:00',
            );
        });

        it('нераспознанная строка — ошибка, а не молчаливый сдвиг', () => {
            expect(() => moscow().crmDateTime('вчера вечером')).toThrow();
        });
    });

    describe('абсолютный момент', () => {
        // 10:00 UTC = 13:00 Москва = 18:00 Иркутск.
        const instant = new Date('2026-07-01T10:00:00.000Z');

        it('Date раскладывается в TZ портала, а не в TZ машины', () => {
            expect(moscow().crmDateTime(instant)).toBe('01.07.2026 13:00:00');
            expect(irkutsk().crmDateTime(instant)).toBe('01.07.2026 18:00:00');
        });

        it('fromInstant даёт то же значение, что и crmDateTime', () => {
            expect(irkutsk().fromInstant(instant).toCrmDateTime()).toBe(
                irkutsk().crmDateTime(instant),
            );
        });

        /*
         * Разница принципиальная: '01.07.2026 13:00:00' с иркутского портала
         * — это 05:00 UTC, а тот же момент как Date — 18:00 по порталу.
         */
        it('строка и Date трактуются по-разному — это не одно и то же', () => {
            const dt = irkutsk();
            expect(dt.crmDateTime('01.07.2026 13:00:00')).toBe(
                '01.07.2026 13:00:00',
            );
            expect(dt.crmDateTime(instant)).toBe('01.07.2026 18:00:00');
        });
    });

    describe('now', () => {
        it('nowCrmDateTime отдаёт формат CRM-поля', () => {
            expect(moscow().nowCrmDateTime()).toMatch(
                /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$/,
            );
        });

        it('now() — значение с TZ портала', () => {
            expect(irkutsk().now().getPortalTimezone()).toBe(
                ETimeZone.ASIA_IRKUTSK,
            );
        });
    });

    describe('человекочитаемые строки', () => {
        const instant = new Date('2026-05-28T11:30:00.000Z');

        it('дата без года и с годом считаются в TZ портала', () => {
            expect(moscow().ruHuman(instant)).toBe('28 мая 2026');
            expect(moscow().ruHumanDateTime(instant)).toBe('28 мая 14:30');
        });
    });
});
