import type { TranscriptionPipelineStateView } from '@lib/call-lib';
import { CALL_REPORT_CALL_TYPE_ITEMS } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import { readClientCallBrief } from '../client-calls/client-call-brief.reader';
import { CLIENT_CALLS_LIMIT } from '../client-calls/client-calls.const';
import {
    presentClientCalls,
    type ClientCallsSource,
} from '../client-calls/client-calls.presenter';
import type { ClientCallActivity } from '../client-calls/client-calls.types';

const NOW = new Date('2026-11-16T12:00:00.000Z');
const CALL_TYPE = CALL_REPORT_CALL_TYPE_ITEMS[0];

const call = (activityId: number): ClientCallActivity => ({
    activityId,
    startedAt: '2026-11-16T09:00:00.000Z',
    direction: 'outgoing',
    responsibleId: 107,
    owner: { type: 'deal', id: 79153 },
    subject: 'Исходящий звонок',
});

const state = (
    activityId: number,
    patch: Partial<TranscriptionPipelineStateView> = {},
): TranscriptionPipelineStateView => ({
    id: String(40000 + activityId),
    activityId: String(activityId),
    status: 'done',
    callStartedAt: new Date('2026-11-16T09:12:30.000Z'),
    durationSec: '312.4',
    userId: '107',
    updatedAt: new Date('2026-11-16T09:30:00.000Z'),
    ...patch,
});

const ANALYSIS = {
    callType: CALL_TYPE.CODE,
    summary: '  Клиент попросил коммерческое предложение.  ',
    score: 7,
    nextStep: {
        set: true,
        description: 'Отправить предложение',
        date: '2026-11-18',
    },
    objections: [{ objection: 'Дорого' }, { objection: 'Подумаю' }],
    incompleteParts: [],
};

const source = (patch: Partial<ClientCallsSource> = {}): ClientCallsSource => ({
    calls: [call(501)],
    total: 1,
    states: new Map(),
    analyses: new Map(),
    pageUrls: new Map(),
    now: NOW,
    ...patch,
});

describe('presentClientCalls', () => {
    it('разобранный звонок: итог разбора, ссылка, время и длительность из телефонии', () => {
        const result = presentClientCalls(
            source({
                states: new Map([['501', state(501)]]),
                analyses: new Map<string, unknown>([['40501', ANALYSIS]]),
                pageUrls: new Map([['40501', 'https://report.test/call/t']]),
            }),
        );

        expect(result.calls[0]).toEqual({
            activityId: 501,
            startedAt: '2026-11-16T09:12:30.000Z',
            durationSec: 312,
            direction: 'outgoing',
            responsibleId: 107,
            owner: { type: 'deal', id: 79153 },
            subject: 'Исходящий звонок',
            state: 'analyzed',
            stateTitle: 'Разобран',
            transcriptionId: '40501',
            pageUrl: 'https://report.test/call/t',
            brief: {
                callTypeTitle: CALL_TYPE.VALUE,
                summary: 'Клиент попросил коммерческое предложение.',
                nextStep: {
                    set: true,
                    description: 'Отправить предложение',
                    date: '2026-11-18',
                },
                objections: 2,
                incomplete: false,
            },
        });
    });

    it('оценку разбора в список не отдаёт', () => {
        const result = presentClientCalls(
            source({
                states: new Map([['501', state(501)]]),
                analyses: new Map<string, unknown>([['40501', ANALYSIS]]),
            }),
        );

        expect(JSON.stringify(result)).not.toContain('score');
    });

    it('до звонка конвейер не дошёл: время из дела, разбора и ссылки нет', () => {
        const result = presentClientCalls(source());

        expect(result.calls[0]).toMatchObject({
            startedAt: '2026-11-16T09:00:00.000Z',
            durationSec: null,
            state: 'none',
            stateTitle: 'Ещё не разбирался',
            transcriptionId: null,
            pageUrl: null,
            brief: null,
        });
    });

    it('звонок в очереди и упавший звонок — без итога и без ссылки', () => {
        const result = presentClientCalls(
            source({
                calls: [call(501), call(502)],
                total: 2,
                states: new Map([
                    [
                        '501',
                        state(501, { status: 'queued', durationSec: null }),
                    ],
                    ['502', state(502, { status: 'error' })],
                ]),
                // Ссылка есть, а разбора нет — ссылку не показываем.
                pageUrls: new Map([['40502', 'https://report.test/call/x']]),
            }),
        );

        expect(result.calls.map(item => item.state)).toEqual([
            'processing',
            'failed',
        ]);
        expect(result.calls.map(item => item.stateTitle)).toEqual([
            'Разбирается',
            'Разобрать не удалось',
        ]);
        expect(result.calls.every(item => item.brief === null)).toBe(true);
        expect(result.calls.every(item => item.pageUrl === null)).toBe(true);
    });

    it('расшифрован давно, разбора нет — «разбор не делался»', () => {
        const result = presentClientCalls(
            source({
                states: new Map([
                    [
                        '501',
                        state(501, {
                            updatedAt: new Date('2026-11-15T09:30:00.000Z'),
                        }),
                    ],
                ]),
            }),
        );

        expect(result.calls[0].state).toBe('skipped');
        expect(result.calls[0].stateTitle).toBe(
            'Расшифрован, разбор не делался',
        );
    });

    it('отдаёт общее число звонков и предел страницы', () => {
        const result = presentClientCalls(source({ total: 64 }));

        expect(result.total).toBe(64);
        expect(result.limit).toBe(CLIENT_CALLS_LIMIT);
    });

    it('нет адреса страницы разбора — разбор отдаётся без ссылки', () => {
        const result = presentClientCalls(
            source({
                states: new Map([['501', state(501)]]),
                analyses: new Map<string, unknown>([['40501', ANALYSIS]]),
            }),
        );

        expect(result.calls[0].state).toBe('analyzed');
        expect(result.calls[0].pageUrl).toBeNull();
    });
});

describe('readClientCallBrief', () => {
    it('нагрузка не объект — разбора нет', () => {
        expect(readClientCallBrief(null)).toBeNull();
        expect(readClientCallBrief('текст')).toBeNull();
        expect(readClientCallBrief(undefined)).toBeNull();
    });

    it('пустой разбор читается без ошибок', () => {
        expect(readClientCallBrief({})).toEqual({
            callTypeTitle: null,
            summary: null,
            nextStep: null,
            objections: 0,
            incomplete: false,
        });
    });

    it('тип звонка не из справочника не показывается кодом', () => {
        expect(
            readClientCallBrief({ callType: 'unknown_type_code' })
                ?.callTypeTitle,
        ).toBeNull();
    });

    it('неполный разбор помечается', () => {
        expect(
            readClientCallBrief({ incompleteParts: ['movement'] })?.incomplete,
        ).toBe(true);
    });

    it('поля не того типа читаются как отсутствующие', () => {
        expect(
            readClientCallBrief({
                summary: 42,
                nextStep: 'завтра',
                objections: 'нет',
                incompleteParts: 'да',
            }),
        ).toEqual({
            callTypeTitle: null,
            summary: null,
            nextStep: null,
            objections: 0,
            incomplete: false,
        });
    });

    it('следующий шаг без признака «назначен» не отдаётся', () => {
        expect(
            readClientCallBrief({ nextStep: { description: 'Перезвонить' } })
                ?.nextStep,
        ).toBeNull();
        expect(
            readClientCallBrief({ nextStep: { set: false } })?.nextStep,
        ).toEqual({ set: false, description: null, date: null });
    });
});
