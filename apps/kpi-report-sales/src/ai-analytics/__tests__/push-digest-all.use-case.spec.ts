import { DigestItem } from '@lib/sales-ai-analytics';
import { PushDigestAllUseCase } from '../domain/use-cases/push-digest-all.use-case';
import { AiPushRunContext } from '../domain/use-cases/push.types';
import { AiAnalyticsPushLogStore } from '../store/ai-analytics-push-log.store';
import { DIGEST_ALL_NO_CALLS } from '../delivery/ai-analytics-digest-all-message.util';
import { portalSettings } from './fixtures/lite-row.fixture';

const digestItem: DigestItem = {
    transcriptionId: 'a1',
    callStartedAt: new Date('2026-09-04T08:20:00Z'),
    section: 'NEEDS',
    asWas: 'Было',
    alternatives: ['Иначе'],
};

interface NotifyArgs {
    USER_ID: number | string;
    MESSAGE: string;
    TAG: string;
}

function makeBitrix(failFor: number[] = []) {
    const systemAdd = jest.fn(
        ({ USER_ID }: NotifyArgs): Promise<unknown> =>
            failFor.includes(Number(USER_ID))
                ? Promise.reject(new Error('ACCESS_DENIED'))
                : Promise.resolve({ result: true }),
    );
    const get = jest.fn(({ ID }: { ID: string }) =>
        Promise.resolve({
            result: [{ LAST_NAME: 'Менеджер', NAME: ID }],
        }),
    );
    return {
        bitrix: { imNotify: { systemAdd }, user: { get } },
        systemAdd,
        get,
    };
}

function context(overrides: Partial<AiPushRunContext> = {}): AiPushRunContext {
    return {
        domain: 'd',
        date: '2026-09-07',
        now: new Date('2026-09-07T09:00:00Z'),
        settings: portalSettings({ digestAllUserIds: [447, 448] }),
        recipients: null,
        ...overrides,
    };
}

function makeCase(
    options: {
        sent?: boolean;
        failFor?: number[];
        byManager?: Map<string, DigestItem[]>;
        roster?: number[];
    } = {},
) {
    const { bitrix, systemAdd, get } = makeBitrix(options.failFor);
    const pbx = { init: jest.fn().mockResolvedValue({ bitrix }) };
    const digestUseCase = {
        execute: jest.fn().mockResolvedValue({
            day: '2026-09-04',
            byManager:
                options.byManager ??
                new Map([
                    ['10', [digestItem]],
                    ['20', [{ ...digestItem, transcriptionId: 'b1' }]],
                ]),
        }),
    };
    const managers = {
        resolve: jest.fn().mockResolvedValue(options.roster ?? [10, 20, 30]),
    };
    const org = {
        load: jest.fn().mockResolvedValue(
            new Map([
                [
                    10,
                    { departmentId: 5, departmentName: 'ОП 1', groupId: null },
                ],
                [
                    20,
                    { departmentId: 5, departmentName: 'ОП 1', groupId: null },
                ],
                [
                    30,
                    { departmentId: 6, departmentName: 'ОП 2', groupId: null },
                ],
            ]),
        ),
    };
    const smartLinks = {
        resolveLinks: jest
            .fn()
            .mockResolvedValue(new Map([['a1', 'https://x/1/']])),
    };
    const feedback = {
        listInPeriod: jest.fn().mockResolvedValue([]),
        add: jest.fn().mockResolvedValue('9001'),
    };
    const store = new AiAnalyticsPushLogStore(feedback as never);
    const wasSent = jest
        .spyOn(store, 'wasSent')
        .mockResolvedValue(options.sent ?? false);
    const markSent = jest.spyOn(store, 'markSent').mockResolvedValue('9001');
    const useCase = new PushDigestAllUseCase(
        pbx as never,
        digestUseCase as never,
        managers as never,
        org as never,
        smartLinks as never,
        store,
    );
    return {
        useCase,
        systemAdd,
        get,
        digestUseCase,
        managers,
        org,
        smartLinks,
        pbx,
        wasSent,
        markSent,
    };
}

describe('PushDigestAllUseCase (сводный дайджест по всем менеджерам)', () => {
    it('шлёт адресатам из настроек один текст по отделам, пишет digest_sent digest_all:{day} без менеджера', async () => {
        const { useCase, systemAdd, wasSent, markSent, smartLinks, get } =
            makeCase();
        const result = await useCase.run(context());
        expect(result).toEqual({
            kind: 'digest_all',
            date: '2026-09-07',
            status: 'sent',
            reason: null,
            delivered: [447, 448],
        });
        expect(wasSent).toHaveBeenCalledWith(
            {
                domain: 'd',
                kind: 'digest_sent',
                object: 'digest_all:2026-09-04',
                managerId: null,
            },
            new Date('2026-09-03T21:00:00.000Z'),
        );
        expect(smartLinks.resolveLinks).toHaveBeenCalledWith('d', ['a1', 'b1']);
        // Имена — по всему ростеру и менеджерам со звонками.
        expect(get).toHaveBeenCalledTimes(3);
        expect(systemAdd).toHaveBeenCalledTimes(2);
        const [{ USER_ID, MESSAGE, TAG }] = systemAdd.mock.calls[0];
        expect(USER_ID).toBe(447);
        expect(TAG).toBe('ai-analytics:digest_all:2026-09-04');
        expect(MESSAGE).toContain('[B]ОП 1[/B]');
        expect(MESSAGE).toContain('Менеджер 10');
        expect(MESSAGE).toContain('https://x/1/');
        expect(MESSAGE).toContain(`${DIGEST_ALL_NO_CALLS}: Менеджер 30`);
        expect(markSent).toHaveBeenCalledWith({
            domain: 'd',
            kind: 'digest_sent',
            object: 'digest_all:2026-09-04',
            managerId: null,
            payload: {
                recipients: [447, 448],
                managerIds: ['10', '20'],
                transcriptionIds: ['a1', 'b1'],
            },
        });
    });

    it('идёт без digest_enabled; нет адресатов → no-recipients; выходной → not-workday', async () => {
        const { useCase, digestUseCase } = makeCase();
        expect(
            (
                await useCase.run(
                    context({
                        settings: portalSettings({
                            digestEnabled: false,
                            digestAllUserIds: [447],
                        }),
                    }),
                )
            ).status,
        ).toBe('sent');
        expect(
            await useCase.run(
                context({ settings: portalSettings({ digestAllUserIds: [] }) }),
            ),
        ).toMatchObject({ status: 'skipped', reason: 'no-recipients' });
        expect(
            await useCase.run(context({ date: '2026-09-06' })),
        ).toMatchObject({ status: 'skipped', reason: 'not-workday' });
        expect(digestUseCase.execute).toHaveBeenCalledTimes(1);
    });

    it('дедуп по дате: отметка за день есть → already-sent без расчёта и отправки', async () => {
        const { useCase, digestUseCase, pbx, systemAdd, markSent } = makeCase({
            sent: true,
        });
        expect(await useCase.run(context())).toMatchObject({
            status: 'skipped',
            reason: 'already-sent',
        });
        expect(digestUseCase.execute).not.toHaveBeenCalled();
        expect(pbx.init).not.toHaveBeenCalled();
        expect(systemAdd).not.toHaveBeenCalled();
        expect(markSent).not.toHaveBeenCalled();
    });

    it('пустой день отправляется с текстом «Звонков не было»', async () => {
        const { useCase, systemAdd } = makeCase({ byManager: new Map() });
        expect(await useCase.run(context())).toMatchObject({ status: 'sent' });
        const [{ MESSAGE }] = systemAdd.mock.calls[0];
        expect(MESSAGE).toContain(`${DIGEST_ALL_NO_CALLS}.`);
    });

    it('никому не доставлено → failed, отметка не пишется', async () => {
        const { useCase, markSent } = makeCase({ failFor: [447, 448] });
        expect(await useCase.run(context())).toMatchObject({
            status: 'failed',
            reason: 'not-delivered',
            delivered: [],
        });
        expect(markSent).not.toHaveBeenCalled();
    });

    it('ручной запуск «себе»: получатели вместо настроек, отметки не читаются и не пишутся, выходной не мешает', async () => {
        const { useCase, systemAdd, wasSent, markSent } = makeCase({
            sent: true,
        });
        const result = await useCase.run(
            context({
                date: '2026-09-06',
                settings: portalSettings({ digestAllUserIds: [] }),
                recipients: [1],
            }),
        );
        expect(result).toMatchObject({ status: 'sent', delivered: [1] });
        expect(systemAdd).toHaveBeenCalledTimes(1);
        expect(systemAdd.mock.calls[0][0].USER_ID).toBe(1);
        expect(wasSent).not.toHaveBeenCalled();
        expect(markSent).not.toHaveBeenCalled();
    });
});
