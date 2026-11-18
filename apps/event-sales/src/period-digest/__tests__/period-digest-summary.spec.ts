import type { DigestRecommendation } from '@lib/sales-ai-analytics';
import {
    PeriodDigestCardTally,
    periodDigestReportOf,
    periodDigestSummaryLines,
    periodDigestTimezoneWarning,
} from '../lib/period-digest-summary';

describe('пояса двух настроек портала', () => {
    it('совпали — без предупреждения, разошлись — одна строка с обоими поясами', () => {
        expect(
            periodDigestTimezoneWarning('Europe/Moscow', 'Europe/Moscow'),
        ).toBeNull();
        expect(
            periodDigestTimezoneWarning('Europe/Moscow', 'Asia/Novosibirsk'),
        ).toBe(
            'пояс календаря AI-аналитики (Asia/Novosibirsk) не совпадает с ' +
                'поясом портала (Europe/Moscow): границы периода — по поясу ' +
                'портала, «дни без записанных звонков» — по календарю ' +
                'AI-аналитики',
        );
    });
});

type Tally = PeriodDigestCardTally['recommendations'][number];

const recommendation = (
    lifecycle: DigestRecommendation['lifecycle'],
    status: DigestRecommendation['status'] = 'same',
): Tally => ({ lifecycle, status });

const card = (
    readiness: PeriodDigestCardTally['readiness'],
    recommendations: Tally[] = [],
): PeriodDigestCardTally => ({ readiness, recommendations });

describe('итог прогона итогов периода', () => {
    const report = periodDigestReportOf(
        [
            card('ok', [
                recommendation('active', 'new'),
                recommendation('active', 'improved'),
                recommendation('fixed'),
            ]),
            card('ok', [
                recommendation('escalated'),
                recommendation('dropped'),
            ]),
            card('few_data'),
            card('no_calls'),
        ],
        { created: 1, updated: 2, unchanged: 1 },
    );

    it('счёт по готовности данных, рекомендациям и сохранению', () => {
        expect(report).toEqual({
            managers: 4,
            readiness: { ok: 2, fewData: 1, noCalls: 1 },
            recommendations: {
                active: 2,
                fresh: 1,
                fixed: 1,
                escalated: 1,
                dropped: 1,
            },
            saved: { created: 1, updated: 2, unchanged: 1 },
        });
    });

    it('строки итога — по-русски, без кодов', () => {
        const lines = periodDigestSummaryLines(report);

        expect(lines).toEqual([
            'Менеджеров: 4 — данных достаточно у 2, мало данных у 1, без записанных звонков у 1',
            'Рекомендаций в работе: 2 (новых 1); закрепить: 1, обсудить с РОПом: 1, снято без данных: 1',
            'Карточек сохранено: 3 (новых 1, обновлено 2), без изменений: 1',
        ]);
        lines.forEach(line => expect(line).not.toMatch(/[A-Za-z_]/));
    });
});
