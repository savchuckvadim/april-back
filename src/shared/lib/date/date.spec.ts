import { ETimeZone, resolveTimezoneByDomain } from './timezone';
import { parsePortalInput } from './parse-portal-input';
import { toTaskDeadline } from './to-task-deadline';
import { toCrmDateTime } from './to-crm-datetime';
import { toRuHumanDate } from './to-ru-human';

describe('resolveTimezoneByDomain', () => {
    it('возвращает Asia/Novosibirsk для alfacentr.bitrix24.ru', () => {
        expect(resolveTimezoneByDomain('alfacentr.bitrix24.ru')).toBe(
            ETimeZone.ASIA_NOVOSIBIRSK,
        );
    });

    it('возвращает Asia/Irkutsk для gsirk.bitrix24.ru', () => {
        expect(resolveTimezoneByDomain('gsirk.bitrix24.ru')).toBe(
            ETimeZone.ASIA_IRKUTSK,
        );
    });

    it('возвращает Europe/Moscow для незарегистрированного домена', () => {
        expect(resolveTimezoneByDomain('april-dev.bitrix24.ru')).toBe(
            ETimeZone.EUROPE_MOSCOW,
        );
        expect(resolveTimezoneByDomain('unknown.bitrix24.ru')).toBe(
            ETimeZone.EUROPE_MOSCOW,
        );
    });
});

describe('parsePortalInput', () => {
    it('парсит формат dd.MM.yyyy HH:mm:ss как локальное время портала', () => {
        const d = parsePortalInput(
            '26.05.2026 10:00:00',
            ETimeZone.ASIA_NOVOSIBIRSK,
        );
        // 10:00 NSK = 03:00 UTC
        expect(d.toISOString()).toBe('2026-05-26T03:00:00.000Z');
    });

    it('парсит ISO-дату без времени как 00:00 локального портала', () => {
        const d = parsePortalInput('2026-05-26', ETimeZone.EUROPE_MOSCOW);
        // 00:00 MSK (UTC+3) = 2025-05-25T21:00 UTC
        expect(d.toISOString()).toBe('2026-05-25T21:00:00.000Z');
    });

    it('парсит формат yyyy-MM-dd HH:mm:ss', () => {
        const d = parsePortalInput(
            '2026-05-26 09:30:00',
            ETimeZone.EUROPE_MOSCOW,
        );
        expect(d.toISOString()).toBe('2026-05-26T06:30:00.000Z');
    });

    it('кидает Error на нераспознанный формат', () => {
        expect(() =>
            parsePortalInput('not-a-date', ETimeZone.EUROPE_MOSCOW),
        ).toThrow(/parsePortalInput/);
    });
});

describe('toTaskDeadline', () => {
    it('Novosibirsk -> Moscow: 10:00 NSK становится 06:00 MSK', () => {
        expect(
            toTaskDeadline('26.05.2026 10:00:00', ETimeZone.ASIA_NOVOSIBIRSK),
        ).toBe('2026-05-26 06:00:00');
    });

    it('Irkutsk -> Moscow: 10:00 IRK становится 05:00 MSK', () => {
        expect(
            toTaskDeadline('26.05.2026 10:00:00', ETimeZone.ASIA_IRKUTSK),
        ).toBe('2026-05-26 05:00:00');
    });

    it('Moscow -> Moscow: без сдвига', () => {
        expect(
            toTaskDeadline('26.05.2026 10:00:00', ETimeZone.EUROPE_MOSCOW),
        ).toBe('2026-05-26 10:00:00');
    });

    it('принимает входной ISO с датой без времени', () => {
        // 00:00 NSK -> 20:00 MSK предыдущего дня (UTC+7 vs UTC+3)
        expect(toTaskDeadline('2026-05-26', ETimeZone.ASIA_NOVOSIBIRSK)).toBe(
            '2026-05-25 20:00:00',
        );
    });
});

describe('toCrmDateTime', () => {
    it('нормализует формат до dd.MM.yyyy HH:mm:ss, оставаясь в TZ портала', () => {
        expect(
            toCrmDateTime('2026-05-26 09:30:00', ETimeZone.EUROPE_MOSCOW),
        ).toBe('26.05.2026 09:30:00');
    });

    it('принимает уже dd.MM.yyyy HH:mm:ss и не сдвигает время', () => {
        expect(
            toCrmDateTime('26.05.2026 14:15:30', ETimeZone.ASIA_NOVOSIBIRSK),
        ).toBe('26.05.2026 14:15:30');
    });

    it('дата без времени → 00:00:00 локального портала', () => {
        expect(toCrmDateTime('2026-05-26', ETimeZone.ASIA_IRKUTSK)).toBe(
            '26.05.2026 00:00:00',
        );
    });
});

describe('toRuHumanDate', () => {
    it('форматирует как «26 мая 2026» без «г.»', () => {
        expect(
            toRuHumanDate('26.05.2026 10:00:00', ETimeZone.EUROPE_MOSCOW),
        ).toBe('26 мая 2026');
    });

    it('сохраняет календарный день в TZ портала на полночь', () => {
        // 00:00 NSK = 20:00 MSK предыдущего дня, но человеку показываем NSK-день
        expect(toRuHumanDate('2026-05-26', ETimeZone.ASIA_NOVOSIBIRSK)).toBe(
            '26 мая 2026',
        );
    });
});
