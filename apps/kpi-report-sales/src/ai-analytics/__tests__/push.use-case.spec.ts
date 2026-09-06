import { DEFAULT_WORK_CALENDAR, DigestItem } from '@lib/sales-ai-analytics';
import { PushAgendaUseCase } from '../domain/use-cases/push-agenda.use-case';
import { PushDigestUseCase } from '../domain/use-cases/push-digest.use-case';
import { AiAnalyticsPushUseCase } from '../domain/use-cases/push.use-case';
import { AiPushRunContext } from '../domain/use-cases/push.types';
import { AiAgendaDto } from '../dto/ai-agenda.dto';
import { AiAnalyticsQueueProcessor } from '../queue/ai-analytics.processor';
import { AiAnalyticsPushLogStore } from '../store/ai-analytics-push-log.store';

const agenda: AiAgendaDto = {
    weekKey: '2026-W37',
    items: [
        {
            transcriptionId: 'r1',
            managerId: '10',
            callType: 'presentation',
            kind: 'risk',
            reason: 'Риск-флаги: promise',
            quote: 'Перезвоним',
            charOffset: null,
            link: null,
            score: 40,
        },
    ],
    disagreements: [],
};

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
    const get = jest
        .fn()
        .mockResolvedValue({ result: [{ LAST_NAME: 'И', NAME: 'И' }] });
    return { bitrix: { imNotify: { systemAdd }, user: { get } }, systemAdd };
}

function makePushLog(sent = false) {
    const feedback = {
        listInPeriod: jest.fn().mockResolvedValue([]),
        add: jest.fn().mockResolvedValue('9001'),
    };
    const store = new AiAnalyticsPushLogStore(feedback as never);
    const wasSent = jest.spyOn(store, 'wasSent').mockResolvedValue(sent);
    const markSent = jest.spyOn(store, 'markSent').mockResolvedValue('9001');
    return { store, wasSent, markSent };
}

function context(overrides: Partial<AiPushRunContext> = {}): AiPushRunContext {
    return {
        domain: 'd',
        date: '2026-09-07',
        now: new Date('2026-09-07T09:00:00Z'),
        settings: {
            enabled: true,
            auditEnabled: false,
            alertsEnabled: false,
            digestEnabled: true,
            ropUserIds: [447, 448],
            calendar: { ...DEFAULT_WORK_CALENDAR },
        },
        recipients: null,
        ...overrides,
    };
}

function makeAgendaCase(
    options: { sent?: boolean; failFor?: number[]; items?: boolean } = {},
) {
    const { bitrix, systemAdd } = makeBitrix(options.failFor);
    const pbx = { init: jest.fn().mockResolvedValue({ bitrix }) };
    const agendaUseCase = {
        resolveWeek: jest.fn().mockResolvedValue({
            weekKey: '2026-W37',
            timeZone: 'Europe/Moscow',
        }),
        execute: jest
            .fn()
            .mockResolvedValue(
                options.items === false ? { ...agenda, items: [] } : agenda,
            ),
    };
    const log = makePushLog(options.sent);
    const useCase = new PushAgendaUseCase(
        pbx as never,
        agendaUseCase as never,
        log.store,
    );
    return { useCase, systemAdd, agendaUseCase, pbx, ...log };
}

function makeDigestCase(
    options: { sent?: boolean; byManager?: Map<string, DigestItem[]> } = {},
) {
    const { bitrix, systemAdd } = makeBitrix();
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
    const smartLinks = {
        resolveLinks: jest
            .fn()
            .mockResolvedValue(new Map([['a1', 'https://x/1/']])),
    };
    const log = makePushLog(options.sent);
    const useCase = new PushDigestUseCase(
        pbx as never,
        digestUseCase as never,
        smartLinks as never,
        log.store,
    );
    return { useCase, systemAdd, digestUseCase, smartLinks, pbx, ...log };
}

describe('PushAgendaUseCase', () => {
    it('шлёт РОПам из настроек, пишет agenda_sent с доставленными и звонками', async () => {
        const { useCase, systemAdd, markSent, wasSent } = makeAgendaCase();
        const result = await useCase.run(context());
        expect(result).toEqual({
            kind: 'agenda',
            date: '2026-09-07',
            status: 'sent',
            reason: null,
            delivered: [447, 448],
        });
        expect(systemAdd).toHaveBeenCalledTimes(2);
        expect(wasSent).toHaveBeenCalledWith(
            {
                domain: 'd',
                kind: 'agenda_sent',
                object: 'agenda:2026-W37',
                managerId: null,
            },
            new Date('2026-09-06T21:00:00.000Z'), // пн 07.09 00:00 МСК
        );
        expect(markSent).toHaveBeenCalledWith({
            domain: 'd',
            kind: 'agenda_sent',
            object: 'agenda:2026-W37',
            managerId: null,
            payload: { ropUserIds: [447, 448], transcriptionIds: ['r1'] },
        });
    });

    it('идемпотентность: agenda_sent за неделю уже есть → skipped, без отправки', async () => {
        const { useCase, systemAdd, agendaUseCase, pbx } = makeAgendaCase({
            sent: true,
        });
        const result = await useCase.run(context());
        expect(result.status).toBe('skipped');
        expect(result.reason).toBe('already-sent');
        expect(agendaUseCase.execute).not.toHaveBeenCalled();
        expect(pbx.init).not.toHaveBeenCalled();
        expect(systemAdd).not.toHaveBeenCalled();
    });

    it('нет РОПов → no-recipients; пустая повестка → empty', async () => {
        const { useCase } = makeAgendaCase();
        const noRop = await useCase.run(
            context({ settings: { ...context().settings, ropUserIds: [] } }),
        );
        expect(noRop).toMatchObject({
            status: 'skipped',
            reason: 'no-recipients',
        });
        const { useCase: emptyCase, markSent } = makeAgendaCase({
            items: false,
        });
        expect(await emptyCase.run(context())).toMatchObject({
            status: 'skipped',
            reason: 'empty',
        });
        expect(markSent).not.toHaveBeenCalled();
    });

    it('никому не доставлено → failed, отметка не пишется', async () => {
        const { useCase, markSent } = makeAgendaCase({ failFor: [447, 448] });
        expect(await useCase.run(context())).toMatchObject({
            status: 'failed',
            reason: 'not-delivered',
            delivered: [],
        });
        expect(markSent).not.toHaveBeenCalled();
    });

    it('ручные получатели: отправка им, отметки не читаются и не пишутся', async () => {
        const { useCase, systemAdd, wasSent, markSent } = makeAgendaCase({
            sent: true,
        });
        const result = await useCase.run(context({ recipients: [1] }));
        expect(result).toMatchObject({ status: 'sent', delivered: [1] });
        expect(systemAdd).toHaveBeenCalledTimes(1);
        expect(wasSent).not.toHaveBeenCalled();
        expect(markSent).not.toHaveBeenCalled();
    });
});

describe('PushDigestUseCase', () => {
    it('без флага digest_enabled дайджест не считается и не шлётся', async () => {
        const { useCase, digestUseCase, systemAdd } = makeDigestCase();
        const result = await useCase.run(
            context({
                settings: { ...context().settings, digestEnabled: false },
            }),
        );
        expect(result).toMatchObject({
            status: 'skipped',
            reason: 'digest-disabled',
        });
        expect(digestUseCase.execute).not.toHaveBeenCalled();
        expect(systemAdd).not.toHaveBeenCalled();
    });

    it('выходной день запуска → not-workday', async () => {
        const { useCase, digestUseCase } = makeDigestCase();
        const result = await useCase.run(context({ date: '2026-09-06' }));
        expect(result).toMatchObject({
            status: 'skipped',
            reason: 'not-workday',
        });
        expect(digestUseCase.execute).not.toHaveBeenCalled();
    });

    it('каждому менеджеру — свой дайджест, digest_sent на домен+менеджер+день', async () => {
        const { useCase, systemAdd, markSent, wasSent, smartLinks } =
            makeDigestCase();
        const result = await useCase.run(context());
        expect(result).toMatchObject({ status: 'sent', delivered: [10, 20] });
        expect(systemAdd).toHaveBeenCalledTimes(2);
        expect(smartLinks.resolveLinks).toHaveBeenCalledWith('d', ['a1', 'b1']);
        expect(wasSent).toHaveBeenCalledWith(
            {
                domain: 'd',
                kind: 'digest_sent',
                object: 'digest:2026-09-04',
                managerId: '10',
            },
            new Date('2026-09-03T21:00:00.000Z'),
        );
        expect(markSent).toHaveBeenCalledTimes(2);
        expect(markSent).toHaveBeenCalledWith({
            domain: 'd',
            kind: 'digest_sent',
            object: 'digest:2026-09-04',
            managerId: '10',
            payload: { transcriptionIds: ['a1'] },
        });
        const [{ USER_ID, MESSAGE }] = systemAdd.mock.calls[0];
        expect(USER_ID).toBe(10);
        expect(MESSAGE).toContain('https://x/1/');
    });

    it('идемпотентность: digest_sent уже есть → менеджер пропускается', async () => {
        const { useCase, systemAdd, markSent } = makeDigestCase({ sent: true });
        const result = await useCase.run(context());
        expect(result).toMatchObject({
            status: 'failed',
            reason: 'not-delivered',
        });
        expect(systemAdd).not.toHaveBeenCalled();
        expect(markSent).not.toHaveBeenCalled();
    });

    it('пустой дайджест → empty; нечисловой managerId пропускается', async () => {
        const { useCase } = makeDigestCase({ byManager: new Map() });
        expect(await useCase.run(context())).toMatchObject({
            status: 'skipped',
            reason: 'empty',
        });
        const { useCase: oddCase, systemAdd } = makeDigestCase({
            byManager: new Map([['abc', [digestItem]]]),
        });
        expect(await oddCase.run(context())).toMatchObject({
            status: 'failed',
        });
        expect(systemAdd).not.toHaveBeenCalled();
    });

    it('ручные получатели: дайджесты всех менеджеров уходят им с подписью, без отметок', async () => {
        const { useCase, systemAdd, wasSent, markSent } = makeDigestCase({
            sent: true,
        });
        const result = await useCase.run(
            context({
                date: '2026-09-06',
                settings: { ...context().settings, digestEnabled: false },
                recipients: [447],
            }),
        );
        expect(result).toMatchObject({ status: 'sent', delivered: [447] });
        expect(systemAdd).toHaveBeenCalledTimes(2);
        const [{ USER_ID, MESSAGE }] = systemAdd.mock.calls[0];
        expect(USER_ID).toBe(447);
        expect(MESSAGE).toContain('Менеджер: И И');
        expect(wasSent).not.toHaveBeenCalled();
        expect(markSent).not.toHaveBeenCalled();
    });
});

describe('AiAnalyticsPushUseCase (фасад) и AiAnalyticsQueueProcessor', () => {
    function makeFacade(enabled = true) {
        const settings = {
            load: jest.fn().mockResolvedValue({
                enabled,
                alertsEnabled: false,
                digestEnabled: true,
                ropUserIds: [447],
                calendar: { ...DEFAULT_WORK_CALENDAR },
            }),
        };
        const agenda = { run: jest.fn().mockResolvedValue({ status: 'sent' }) };
        const digest = { run: jest.fn().mockResolvedValue({ status: 'sent' }) };
        return {
            facade: new AiAnalyticsPushUseCase(
                settings as never,
                agenda as never,
                digest as never,
            ),
            agenda,
            digest,
        };
    }

    it('выключенная AI-аналитика → disabled, кейсы не вызываются', async () => {
        const { facade, agenda, digest } = makeFacade(false);
        const result = await facade.execute({
            domain: 'd',
            kind: 'agenda',
            date: '2026-09-07',
        });
        expect(result).toEqual({
            kind: 'agenda',
            date: '2026-09-07',
            status: 'skipped',
            reason: 'disabled',
            delivered: [],
        });
        expect(agenda.run).not.toHaveBeenCalled();
        expect(digest.run).not.toHaveBeenCalled();
    });

    it('контекст: полдень дня в TZ портала, ручные получатели → recipients, пустые → null', async () => {
        const { facade, agenda, digest } = makeFacade();
        await facade.execute({
            domain: 'd',
            kind: 'agenda',
            date: '2026-09-07',
            recipients: [],
        });
        expect(agenda.run).toHaveBeenCalledWith(
            expect.objectContaining({
                date: '2026-09-07',
                now: new Date('2026-09-07T09:00:00.000Z'),
                recipients: null,
            }),
        );
        await facade.execute({
            domain: 'd',
            kind: 'digest',
            date: '2026-09-07',
            recipients: [1],
        });
        expect(digest.run).toHaveBeenCalledWith(
            expect.objectContaining({ recipients: [1] }),
        );
    });

    it('процессор: результат возвращается, ошибка — rethrow', async () => {
        const push = {
            execute: jest.fn().mockResolvedValue({
                status: 'sent',
                reason: null,
                delivered: [1],
            }),
        };
        const processor = new AiAnalyticsQueueProcessor(
            push as never,
            { execute: jest.fn() } as never,
        );
        const job = {
            data: { domain: 'd', kind: 'agenda' as const, date: '2026-09-07' },
        };
        await expect(processor.handlePush(job as never)).resolves.toMatchObject(
            { status: 'sent' },
        );
        expect(push.execute).toHaveBeenCalledWith(job.data);
        push.execute.mockRejectedValueOnce(new Error('bitrix down'));
        await expect(processor.handlePush(job as never)).rejects.toThrow(
            'bitrix down',
        );
    });
});
