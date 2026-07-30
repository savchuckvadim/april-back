import {
    buildCallingStatJobId,
    buildCallingStatResultKey,
    buildKpiReportJobId,
    buildKpiReportResultKey,
    buildReportRequestKey,
    buildReportUsersKey,
} from '../cache/report-cache-key.util';
import { normalizeReportPeriod } from '../../shared/lib/date-util';

describe('buildReportUsersKey', () => {
    it('дедуп, сортировка, отброс мусора', () => {
        expect(buildReportUsersKey(['34', 12, '34', '', undefined, 'x'])).toBe(
            '12_34',
        );
    });

    it('пустой список → all', () => {
        expect(buildReportUsersKey([])).toBe('all');
    });
});

describe('ключи результата и jobId', () => {
    it('resultKey детерминирован и содержит версию', () => {
        expect(
            buildKpiReportResultKey('2026-07-01', '2026-07-30', '12_34'),
        ).toBe('v1:result:2026-07-01_2026-07-30:12_34');
        expect(
            buildCallingStatResultKey('2026-07-01', '2026-07-30', '12_34'),
        ).toBe('v1:result:2026-07-01_2026-07-30:12_34');
    });

    it('jobId включает домен (изоляция порталов) и различает эндпоинты', () => {
        const kpi = buildKpiReportJobId(
            'a.bitrix24.ru',
            '2026-07-01',
            '2026-07-30',
            '12_34',
        );
        const calling = buildCallingStatJobId(
            'a.bitrix24.ru',
            '2026-07-01',
            '2026-07-30',
            '12_34',
        );
        expect(kpi).toBe(
            'kpi-report:v1:a.bitrix24.ru:2026-07-01_2026-07-30:12_34',
        );
        expect(calling).toBe(
            'calling-stat:v1:a.bitrix24.ru:2026-07-01_2026-07-30:12_34',
        );
        expect(
            buildKpiReportJobId(
                'b.bitrix24.ru',
                '2026-07-01',
                '2026-07-30',
                '12_34',
            ),
        ).not.toBe(kpi);
    });

    it('легаси и канон одного периода дают ОДИН jobId (сквозной дедуп)', () => {
        const canonical = normalizeReportPeriod('2026-07-01', '2026-07-30');
        const legacy = normalizeReportPeriod('01.07.2026', '31.07.2026');
        expect(
            buildKpiReportJobId(
                'a.bitrix24.ru',
                canonical.fromIso,
                canonical.toIsoInclusive,
                '12',
            ),
        ).toBe(
            buildKpiReportJobId(
                'a.bitrix24.ru',
                legacy.fromIso,
                legacy.toIsoInclusive,
                '12',
            ),
        );
    });

    it('requestKey — формат from|to|ids (матчинг фронта)', () => {
        expect(buildReportRequestKey('2026-07-01', '2026-07-30', '12_34')).toBe(
            '2026-07-01|2026-07-30|12_34',
        );
    });
});
