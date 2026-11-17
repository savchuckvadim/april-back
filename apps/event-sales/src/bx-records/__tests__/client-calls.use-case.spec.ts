import { BitrixActivityTypeId, BitrixOwnerTypeId } from '@/modules/bitrix';
import { IBXActivity } from '@/modules/bitrix/domain/activity/interfaces/bx-activity.interface';
import { PBXService } from '@/modules/pbx';
import {
    AGENT_ANALYSIS_TYPE,
    AiService,
    CallPageLinkService,
    TranscriptionCallStateService,
    type TranscriptionPipelineStateView,
} from '@lib/call-lib';
import { CLIENT_CALLS_LIMIT } from '../client-calls/client-calls.const';
import { ClientCallsUseCase } from '../client-calls/client-calls.use-case';

const DOMAIN = 'demo.bitrix24.ru';

const activity = (
    id: number,
    patch: Partial<IBXActivity> = {},
): IBXActivity => ({
    ID: id,
    OWNER_TYPE_ID: BitrixOwnerTypeId.DEAL,
    OWNER_ID: 700,
    TYPE_ID: BitrixActivityTypeId.CALL,
    SUBJECT: 'Исходящий звонок',
    RESPONSIBLE_ID: 107,
    // Номер дела растёт вместе со временем звонка.
    START_TIME: new Date(Date.UTC(2026, 10, 1) + id * 60_000).toISOString(),
    END_TIME: '',
    COMMUNICATIONS: [],
    FILES: [{ id: 9000 + id, url: 'https://portal.example/file' }],
    ...patch,
});

const stateOf = (
    activityId: number,
    status: string,
): TranscriptionPipelineStateView => ({
    id: String(40000 + activityId),
    activityId: String(activityId),
    status,
    callStartedAt: null,
    durationSec: '120',
    userId: '107',
    updatedAt: new Date(),
});

interface SetupOptions {
    /** Дела по виду владельца: компания, контакты, лиды, сделки. */
    byOwner?: Partial<Record<BitrixOwnerTypeId, IBXActivity[]>>;
    states?: TranscriptionPipelineStateView[];
    records?: object[];
    urls?: Map<string, string> | Error;
}

function setup(options: SetupOptions = {}) {
    const getAllFresh = jest.fn(
        (filter: { OWNER_TYPE_ID: BitrixOwnerTypeId }) =>
            Promise.resolve({
                activities: options.byOwner?.[filter.OWNER_TYPE_ID] ?? [],
            }),
    );
    const bitrix = {
        deal: {
            getList: jest.fn(() => Promise.resolve({ result: [{ ID: 700 }] })),
        },
        lead: {
            getList: jest.fn(() => Promise.resolve({ result: [{ ID: 300 }] })),
        },
        contact: {
            getList: jest.fn(() => Promise.resolve({ result: [{ ID: 55 }] })),
        },
        activity: { getAllFresh },
    };
    const init = jest.fn<Promise<{ bitrix: typeof bitrix }>, [string]>(() =>
        Promise.resolve({ bitrix }),
    );
    const byActivity = jest.fn<
        Promise<Map<string, TranscriptionPipelineStateView>>,
        [string, readonly (number | string)[]]
    >(() =>
        Promise.resolve(
            new Map(
                (options.states ?? []).map(
                    state => [state.activityId, state] as const,
                ),
            ),
        ),
    );
    const findByTranscriptionIds = jest.fn<Promise<object[]>, [string[]]>(() =>
        Promise.resolve(options.records ?? []),
    );
    const urlsFor = jest.fn<
        Promise<Map<string, string>>,
        [string, readonly string[]]
    >(() =>
        options.urls instanceof Error
            ? Promise.reject(options.urls)
            : Promise.resolve(options.urls ?? new Map<string, string>()),
    );
    const useCase = new ClientCallsUseCase(
        { init } as unknown as PBXService,
        { byActivity } as unknown as TranscriptionCallStateService,
        { findByTranscriptionIds } as unknown as AiService,
        { urlsFor } as unknown as CallPageLinkService,
    );
    return {
        useCase,
        init,
        getAllFresh,
        byActivity,
        findByTranscriptionIds,
        urlsFor,
    };
}

const DTO = { domain: DOMAIN, companyId: 10, contactIds: [] };

describe('ClientCallsUseCase', () => {
    it('собирает звонки по всем связям клиента и убирает повторы', async () => {
        const { useCase, getAllFresh, init } = setup({
            byOwner: {
                [BitrixOwnerTypeId.COMPANY]: [activity(1)],
                [BitrixOwnerTypeId.CONTACT]: [activity(2)],
                [BitrixOwnerTypeId.LEAD]: [activity(3)],
                [BitrixOwnerTypeId.DEAL]: [activity(4), activity(1)],
            },
        });

        const result = await useCase.list(DTO);

        expect(init).toHaveBeenCalledWith(DOMAIN);
        expect(getAllFresh).toHaveBeenCalledTimes(4);
        expect(result.calls.map(call => call.activityId)).toEqual([4, 3, 2, 1]);
        expect(result.total).toBe(4);
    });

    it('разобранному звонку добавляет итог и ссылку на страницу разбора', async () => {
        const { useCase, findByTranscriptionIds, urlsFor } = setup({
            byOwner: {
                [BitrixOwnerTypeId.DEAL]: [activity(1), activity(2)],
            },
            states: [stateOf(1, 'done'), stateOf(2, 'queued')],
            records: [
                {
                    id: '9',
                    type: AGENT_ANALYSIS_TYPE,
                    status: 'done',
                    transcription_id: '40001',
                    user_result: { summary: 'Договорились о встрече' },
                },
            ],
            urls: new Map([['40001', 'https://report.test/call/t1']]),
        });

        const result = await useCase.list(DTO);

        // Разборы читаются только у расшифрованных звонков.
        expect(findByTranscriptionIds).toHaveBeenCalledWith(['40001']);
        expect(urlsFor).toHaveBeenCalledWith(DOMAIN, ['40001']);
        const [queued, analyzed] = result.calls;
        expect(queued).toMatchObject({ activityId: 2, state: 'processing' });
        expect(analyzed).toMatchObject({
            activityId: 1,
            state: 'analyzed',
            pageUrl: 'https://report.test/call/t1',
        });
        expect(analyzed.brief?.summary).toBe('Договорились о встрече');
    });

    it('замещённый разбор не читается: берётся действующий', async () => {
        const { useCase } = setup({
            byOwner: { [BitrixOwnerTypeId.DEAL]: [activity(1)] },
            states: [stateOf(1, 'done')],
            records: [
                {
                    id: '9',
                    type: AGENT_ANALYSIS_TYPE,
                    status: 'superseded',
                    transcription_id: '40001',
                    user_result: { summary: 'Старый разбор' },
                },
                {
                    id: '12',
                    type: AGENT_ANALYSIS_TYPE,
                    status: 'done',
                    transcription_id: '40001',
                    user_result: { summary: 'Новый разбор' },
                },
            ],
        });

        const result = await useCase.list(DTO);

        expect(result.calls[0].brief?.summary).toBe('Новый разбор');
    });

    it('без расшифрованных звонков разборы не запрашивает', async () => {
        const { useCase, findByTranscriptionIds } = setup({
            byOwner: { [BitrixOwnerTypeId.DEAL]: [activity(1)] },
        });

        const result = await useCase.list(DTO);

        expect(findByTranscriptionIds).not.toHaveBeenCalled();
        expect(result.calls[0].state).toBe('none');
    });

    it('состояние спрашивает только у звонков страницы, общее число — по всем', async () => {
        const many = Array.from(
            { length: CLIENT_CALLS_LIMIT + 7 },
            (_, index) => activity(index + 1),
        );
        const { useCase, byActivity } = setup({
            byOwner: { [BitrixOwnerTypeId.DEAL]: many },
        });

        const result = await useCase.list(DTO);

        expect(result.calls).toHaveLength(CLIENT_CALLS_LIMIT);
        expect(result.total).toBe(CLIENT_CALLS_LIMIT + 7);
        expect(byActivity.mock.calls[0][1]).toHaveLength(CLIENT_CALLS_LIMIT);
        // На странице — самые свежие.
        expect(result.calls[0].activityId).toBe(CLIENT_CALLS_LIMIT + 7);
    });

    it('адреса страниц разбора не получены — список отдаётся без ссылок', async () => {
        const { useCase } = setup({
            byOwner: { [BitrixOwnerTypeId.DEAL]: [activity(1)] },
            states: [stateOf(1, 'done')],
            records: [
                {
                    id: '9',
                    type: AGENT_ANALYSIS_TYPE,
                    status: 'done',
                    transcription_id: '40001',
                    user_result: { summary: 'Итог' },
                },
            ],
            urls: new Error('секрет не задан'),
        });

        const result = await useCase.list(DTO);

        expect(result.calls[0].state).toBe('analyzed');
        expect(result.calls[0].pageUrl).toBeNull();
    });

    it('адрес файла записи в Битриксе в ответ не попадает', async () => {
        const { useCase } = setup({
            byOwner: { [BitrixOwnerTypeId.DEAL]: [activity(1)] },
        });

        const result = await useCase.list(DTO);

        expect(JSON.stringify(result)).not.toContain('portal.example');
    });
});
