import {
    agendaTtlSeconds,
    buildAccessKey,
    buildAgendaKey,
    buildPulseKey,
    buildResetPattern,
    buildSettingsKey,
} from '../cache/cache-key.util';
import { AI_ANALYTICS_AGENDA_MIN_TTL_SECONDS } from '../constants/ai-analytics.const';

const DOMAIN = 'april.bitrix24.ru';

describe('cache-key.util (ai-analytics)', () => {
    it('ключи содержат префикс, домен и секцию', () => {
        expect(buildSettingsKey(DOMAIN)).toBe(
            'sales-ai-analytics:v1:april.bitrix24.ru:settings',
        );
        expect(buildPulseKey(DOMAIN, '2026-09-04')).toBe(
            'sales-ai-analytics:v1:april.bitrix24.ru:pulse:2026-09-04',
        );
        expect(buildAgendaKey(DOMAIN, '2026-W36')).toBe(
            'sales-ai-analytics:v1:april.bitrix24.ru:agenda:2026-W36',
        );
        expect(buildAccessKey(DOMAIN, '447')).toBe(
            'sales-ai-analytics:v1:april.bitrix24.ru:access:447',
        );
    });

    it('паттерн сброса: scope → секция, all → весь домен', () => {
        expect(buildResetPattern(DOMAIN, 'pulse')).toBe(
            'sales-ai-analytics:v1:april.bitrix24.ru:pulse:*',
        );
        expect(buildResetPattern(DOMAIN, 'agenda')).toBe(
            'sales-ai-analytics:v1:april.bitrix24.ru:agenda:*',
        );
        expect(buildResetPattern(DOMAIN, 'settings')).toBe(
            'sales-ai-analytics:v1:april.bitrix24.ru:settings:*',
        );
        expect(buildResetPattern(DOMAIN, 'all')).toBe(
            'sales-ai-analytics:v1:april.bitrix24.ru:*',
        );
    });

    it('TTL повестки — до 00:00 следующего понедельника в TZ портала', () => {
        // Суббота 05.09.2026 12:00 MSK → понедельник 07.09 00:00 MSK = 06.09 21:00 UTC
        const now = new Date('2026-09-05T09:00:00Z');
        expect(agendaTtlSeconds(now, 'Europe/Moscow')).toBe(36 * 3600);
    });

    it('в понедельник TTL — до СЛЕДУЮЩЕГО понедельника (7 суток минус прошедшее)', () => {
        const now = new Date('2026-09-07T05:00:00Z'); // пн 08:00 MSK
        expect(agendaTtlSeconds(now, 'Europe/Moscow')).toBe(
            7 * 86400 - 8 * 3600,
        );
    });

    it('TTL не меньше минимального порога', () => {
        const now = new Date('2026-09-06T20:59:50Z'); // за 10 с до понедельника MSK
        expect(agendaTtlSeconds(now, 'Europe/Moscow')).toBe(
            AI_ANALYTICS_AGENDA_MIN_TTL_SECONDS,
        );
    });
});
