import { AnalyticsCallLiteRow } from '@lib/call-lib';
import { PulseUseCase } from '../domain/use-cases/pulse.use-case';
import { applyPulsePerimeter } from '../domain/presenter/pulse.presenter';
import {
    collectPulseAlerts,
    pickAlertQuote,
    resolveAlertKind,
} from '../domain/presenter/pulse-alerts.util';
import { hasCallDate, toPulseRow } from '../domain/loaders/lite-row.mapper';
import { AiAnalyticsFeedbackStore } from '../store/ai-analytics-feedback.store';
import {
    callsLoaderWith,
    liteRow,
    settingsLoaderWith,
} from './fixtures/lite-row.fixture';

/** Суббота 05.09.2026 12:00 MSK → окно пн 31.08 — пт 04.09. */
const NOW = new Date('2026-09-05T09:00:00Z');

/** 40 звонков менеджера 10 в окне: 30 с датой шага, 10 без. */
function windowRows(): AnalyticsCallLiteRow[] {
    return Array.from({ length: 40 }, (_, index) =>
        liteRow({
            transcriptionId: `w${index}`,
            managerId: '10',
            callStartedAt: new Date(
                `2026-09-0${1 + (index % 4)}T${String(8 + (index % 8)).padStart(2, '0')}:00:00Z`,
            ),
            nextStep:
                index < 30
                    ? { set: true, date: '2026-09-10' }
                    : { set: true, date: null },
        }),
    );
}

function feedbackStoreWith(
    records: {
        kind: 'alert_sent' | 'alert_handled';
        transcriptionId: string;
    }[],
): AiAnalyticsFeedbackStore {
    return {
        listInPeriod: jest.fn().mockResolvedValue(
            records.map(record => ({
                ...record,
                id: '1',
                object: `call:${record.transcriptionId}`,
                managerId: '10',
                requesterUserId: null,
                reason: null,
                createdAt: NOW,
            })),
        ),
    } as never;
}

describe('PulseUseCase', () => {
    it('окно — 5 рабочих дней до вчерашнего рабочего дня; выборка покрывает 25 рабочих дней истории', async () => {
        const { loader, loadLite } = callsLoaderWith(windowRows());
        const useCase = new PulseUseCase(
            loader,
            settingsLoaderWith(),
            feedbackStoreWith([]),
        );

        const dto = await useCase.execute('d', { now: NOW });

        expect(dto.periodDate).toBe('2026-09-04');
        expect(dto.window).toEqual({
            from: '2026-08-31',
            to: '2026-09-04',
            workdays: [
                '2026-08-31',
                '2026-09-01',
                '2026-09-02',
                '2026-09-03',
                '2026-09-04',
            ],
        });
        // 25 рабочих дней назад от пт 04.09 — пн 03.08; начало дня MSK = 02.08 21:00Z
        expect(loadLite).toHaveBeenCalledWith(
            expect.objectContaining({
                domain: 'd',
                from: '2026-08-02T21:00:00.000Z',
                to: '2026-09-04T20:59:59.999Z',
            }),
        );
        expect(await useCase.resolveEndDate('d', NOW)).toBe('2026-09-04');
    });

    it('доля шага с датой = 30/40, менеджер с n ≥ 20 попадает в byManager', async () => {
        const rows = [
            ...windowRows(),
            // менеджер 20: 5 звонков — меньше managerMinN
            ...Array.from({ length: 5 }, (_, index) =>
                liteRow({ transcriptionId: `m${index}`, managerId: '20' }),
            ),
            // короткий звонок — только в shortCallsSharePct
            liteRow({ transcriptionId: 'short', durationSec: 60 }),
        ];
        const useCase = new PulseUseCase(
            callsLoaderWith(rows).loader,
            settingsLoaderWith(),
            feedbackStoreWith([]),
        );

        const dto = await useCase.execute('d', { now: NOW });

        expect(dto.analyzedCalls).toBe(45);
        expect(dto.nextStepDateRate.n).toBe(45);
        expect(dto.nextStepDateRate.value).toBeCloseTo(35 / 45, 5);
        expect(dto.nextStepDateRate.confidence.level).toBe('ok');
        expect(dto.byManager.map(row => row.managerId)).toEqual(['10']);
        expect(dto.byManager[0].analyzed).toBe(40);
        expect(dto.shortCallsSharePct).toBeCloseTo((1 / 46) * 100, 1);
    });

    it('alerts: риск-флаг, urgent и alert_sent из ais; handled — по alert_handled', async () => {
        const rows = [
            liteRow({
                transcriptionId: 'risk',
                riskFlags: ['client_negative', 'promise'],
                objections: [
                    {
                        category: 'price',
                        quote: 'Дорого',
                        handled: false,
                        outcome: null,
                    },
                ],
                callStartedAt: new Date('2026-09-01T07:00:00Z'),
            }),
            liteRow({
                transcriptionId: 'urgent',
                coachingPriority: 'urgent',
                managerId: '20',
                callStartedAt: new Date('2026-09-02T07:00:00Z'),
            }),
            liteRow({
                transcriptionId: 'sent',
                callStartedAt: new Date('2026-09-03T07:00:00Z'),
            }),
            liteRow({
                transcriptionId: 'outside',
                riskFlags: ['promise'],
                callStartedAt: new Date('2026-08-20T07:00:00Z'),
            }),
            liteRow({ transcriptionId: 'calm' }),
        ];
        const useCase = new PulseUseCase(
            callsLoaderWith(rows).loader,
            settingsLoaderWith(),
            feedbackStoreWith([
                { kind: 'alert_sent', transcriptionId: 'sent' },
                { kind: 'alert_handled', transcriptionId: 'risk' },
            ]),
        );

        const dto = await useCase.execute('d', { now: NOW });

        expect(
            dto.alerts.map(alert => [
                alert.transcriptionId,
                alert.kind,
                alert.handled,
            ]),
        ).toEqual([
            ['risk', 'promise', true],
            ['urgent', 'urgent', false],
            ['sent', 'urgent', false],
        ]);
        expect(dto.alerts[0].quote).toBe('Дорого');
    });

    it('applyPulsePerimeter: менеджер видит только свои строки byManager и alerts', async () => {
        const rows = [
            ...windowRows(),
            liteRow({
                transcriptionId: 'x',
                managerId: '20',
                riskFlags: ['conflict'],
            }),
        ];
        const useCase = new PulseUseCase(
            callsLoaderWith(rows).loader,
            settingsLoaderWith(),
            feedbackStoreWith([]),
        );
        const dto = await useCase.execute('d', { now: NOW });

        const own = applyPulsePerimeter(dto, {
            role: 'manager',
            visibleManagerIds: ['20'],
        });
        expect(own.byManager).toEqual([]);
        expect(own.alerts.map(alert => alert.transcriptionId)).toEqual(['x']);
        expect(own.nextStepDateRate).toEqual(dto.nextStepDateRate);

        const all = applyPulsePerimeter(dto, {
            role: 'cup',
            visibleManagerIds: null,
        });
        expect(all.byManager).toHaveLength(1);
    });
});

describe('pulse-alerts.util', () => {
    it('вид сигнала — по порядку справочника риск-флагов, иначе urgent, иначе null', () => {
        expect(
            resolveAlertKind({
                riskFlags: ['compliance', 'promise'],
                coachingPriority: null,
            }),
        ).toBe('promise');
        expect(
            resolveAlertKind({
                riskFlags: ['unknown'],
                coachingPriority: 'urgent',
            }),
        ).toBe('urgent');
        expect(
            resolveAlertKind({ riskFlags: [], coachingPriority: 'planned' }),
        ).toBeNull();
    });

    it('цитата: возражение, иначе asWas худшего раздела, длинная обрезается', () => {
        const long = 'а'.repeat(400);
        expect(
            pickAlertQuote({
                objections: [
                    { category: null, quote: '', handled: null, outcome: null },
                ],
                sections: [
                    {
                        section: 'NEEDS',
                        relevance: 1,
                        score: 3,
                        asWas: long,
                        alternatives: [],
                    },
                    {
                        section: 'CLOSE',
                        relevance: 1,
                        score: 8,
                        asWas: 'ок',
                        alternatives: [],
                    },
                ],
            }),
        ).toHaveLength(300);
        expect(pickAlertQuote({ objections: [], sections: [] })).toBe('');
    });

    it('collectPulseAlerts фильтрует по дням окна в TZ портала', () => {
        const row = liteRow({
            transcriptionId: 'edge',
            riskFlags: ['promise'],
            // 31.08 23:30 MSK = 31.08 20:30Z — в окне, хотя UTC-дата та же
            callStartedAt: new Date('2026-08-30T21:30:00Z'),
        });
        const rows = [row].filter(hasCallDate);
        expect(toPulseRow(rows[0]).transcriptionId).toBe('edge');
        const alerts = collectPulseAlerts(
            rows,
            { from: '2026-08-31', to: '2026-09-04' },
            'Europe/Moscow',
            { sent: new Set(), handled: new Set() },
        );
        expect(alerts).toHaveLength(1);
    });
});
