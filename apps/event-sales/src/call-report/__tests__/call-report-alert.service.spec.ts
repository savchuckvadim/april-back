import {
    AI_ANALYTICS_FEEDBACK_APP,
    AI_ANALYTICS_FEEDBACK_PROVIDER,
    AI_ANALYTICS_FEEDBACK_TYPE,
} from '@lib/sales-ai-analytics';
import { CallReportAlertService } from '../services/call-report-alert.service';

const DOMAIN = 'test.bitrix24.ru';

const row = (overrides: Record<string, unknown> = {}) =>
    ({
        id: '42',
        domain: DOMAIN,
        activityId: '101',
        entityType: 'deal',
        entityId: '555',
        userId: '622',
        ...overrides,
    }) as never;

const analysis = (overrides: Record<string, unknown> = {}) =>
    ({
        callType: 'presentation',
        riskFlags: ['promise'],
        coachingPriority: 'planned',
        objections: [
            { objection: 'Дорого', quote: 'Да у нас Консультант стоит' },
        ],
        sections: [],
        ...overrides,
    }) as never;

const makeService = (options?: {
    settings?: Record<string, unknown>;
    records?: Record<string, unknown>[];
}) => {
    const systemAdd = jest.fn().mockResolvedValue({ result: 1 });
    const userGet = jest.fn().mockResolvedValue({
        result: [{ ID: '622', NAME: 'Иван', LAST_NAME: 'Иванов' }],
    });
    const bitrix = { imNotify: { systemAdd }, user: { get: userGet } };
    const pbxService = { init: jest.fn().mockResolvedValue({ bitrix }) };
    const appSettings = {
        resolve: jest.fn().mockResolvedValue({
            aiAnalyticsAlertsEnabled: true,
            aiAnalyticsRopUserIds: '1, 42',
            ...options?.settings,
        }),
    };
    const aiService = {
        findByTranscriptionIds: jest
            .fn()
            .mockResolvedValue(options?.records ?? []),
        create: jest.fn().mockResolvedValue({ id: '9' }),
    };
    const smartResolver = {
        resolve: jest.fn().mockResolvedValue({ entityTypeId: 1056 }),
    };
    const service = new CallReportAlertService(
        pbxService as never,
        appSettings as never,
        aiService as never,
        smartResolver as never,
    );
    return {
        service,
        systemAdd,
        userGet,
        pbxService,
        appSettings,
        aiService,
        smartResolver,
    };
};

/** Текст первого отправленного уведомления. */
const sentMessage = (systemAdd: jest.Mock): string =>
    (systemAdd.mock.calls[0] as [{ MESSAGE: string }])[0].MESSAGE;

/** Тело первой записанной ais-записи (aiService.create). */
const createdRecord = (create: jest.Mock): { user_result: unknown } =>
    (create.mock.calls[0] as [{ user_result: unknown }])[0];

describe('CallReportAlertService — алерт РОПу в день звонка', () => {
    afterEach(() => jest.clearAllMocks());

    it('риск-флаг → уведомление каждому РОПу и запись alert_sent', async () => {
        const { service, systemAdd, aiService, appSettings } = makeService();
        const outcome = await service.notifyIfNeeded(
            DOMAIN,
            analysis(),
            row(),
            777,
        );

        expect(outcome).toEqual({
            status: 'sent',
            kind: 'promise',
            delivered: [1, 42],
        });
        expect(appSettings.resolve).toHaveBeenCalledWith(DOMAIN, 'kpi-sales');
        expect(systemAdd).toHaveBeenCalledTimes(2);
        expect(systemAdd).toHaveBeenCalledWith(
            expect.objectContaining({
                USER_ID: 1,
                TAG: 'call-report-alert:42',
            }),
        );
        expect(systemAdd).toHaveBeenCalledWith(
            expect.objectContaining({ USER_ID: 42 }),
        );
        expect(aiService.create).toHaveBeenCalledTimes(1);
        expect(aiService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                type: AI_ANALYTICS_FEEDBACK_TYPE,
                app: AI_ANALYTICS_FEEDBACK_APP,
                provider: AI_ANALYTICS_FEEDBACK_PROVIDER,
                domain: DOMAIN,
                transcription_id: '42',
                activity_id: '101',
                entity_type: 'deal',
                entity_id: 555,
                user_result: {
                    kind: 'alert_sent',
                    object: 'call:42',
                    managerId: '622',
                    transcriptionId: '42',
                    requesterUserId: null,
                    reason: null,
                    payload: { alertKind: 'promise', ropUserIds: [1, 42] },
                },
            }),
        );
    });

    it('алерт один раз на звонок: при записи alert_sent повтор не шлётся', async () => {
        const { service, systemAdd, aiService, pbxService } = makeService({
            records: [
                {
                    type: AI_ANALYTICS_FEEDBACK_TYPE,
                    user_result: { kind: 'alert_sent', object: 'call:42' },
                },
            ],
        });
        const outcome = await service.notifyIfNeeded(
            DOMAIN,
            analysis(),
            row(),
            777,
        );

        expect(outcome.status).toBe('skipped');
        expect(outcome.reason).toBe('already-sent');
        expect(aiService.findByTranscriptionIds).toHaveBeenCalledWith(['42']);
        expect(pbxService.init).not.toHaveBeenCalled();
        expect(systemAdd).not.toHaveBeenCalled();
        expect(aiService.create).not.toHaveBeenCalled();
    });

    it('другие записи по звонку (разбор, feedback иного вида) не блокируют алерт', async () => {
        const { service, systemAdd } = makeService({
            records: [
                { type: 'agent-analysis', user_result: { callType: 'cold' } },
                {
                    type: AI_ANALYTICS_FEEDBACK_TYPE,
                    user_result: { kind: 'view', object: 'pulse' },
                },
            ],
        });
        const outcome = await service.notifyIfNeeded(
            DOMAIN,
            analysis(),
            row(),
            777,
        );
        expect(outcome.status).toBe('sent');
        expect(systemAdd).toHaveBeenCalledTimes(2);
    });

    it('без флага ai_analytics_alerts_enabled — нет', async () => {
        const { service, systemAdd, aiService, pbxService } = makeService({
            settings: { aiAnalyticsAlertsEnabled: false },
        });
        const outcome = await service.notifyIfNeeded(
            DOMAIN,
            analysis(),
            row(),
            777,
        );

        expect(outcome).toEqual({
            status: 'skipped',
            kind: 'promise',
            delivered: [],
            reason: 'alerts-disabled',
        });
        expect(pbxService.init).not.toHaveBeenCalled();
        expect(systemAdd).not.toHaveBeenCalled();
        expect(aiService.create).not.toHaveBeenCalled();
    });

    it('без риск-флагов и срочного приоритета — нет (настройки не читаются)', async () => {
        const { service, systemAdd, appSettings } = makeService();
        const outcome = await service.notifyIfNeeded(
            DOMAIN,
            analysis({ riskFlags: [], coachingPriority: 'planned' }),
            row(),
            777,
        );

        expect(outcome).toEqual({
            status: 'skipped',
            kind: null,
            delivered: [],
            reason: 'no-risk',
        });
        expect(appSettings.resolve).not.toHaveBeenCalled();
        expect(systemAdd).not.toHaveBeenCalled();
    });

    it('coachingPriority=urgent без флагов — алерт вида urgent', async () => {
        const { service, systemAdd } = makeService();
        const outcome = await service.notifyIfNeeded(
            DOMAIN,
            analysis({ riskFlags: [], coachingPriority: 'urgent' }),
            row(),
            777,
        );

        expect(outcome.status).toBe('sent');
        expect(outcome.kind).toBe('urgent');
        expect(sentMessage(systemAdd)).toContain('Срочно на разбор');
    });

    it('РОПы не заданы — алерт не отправляется', async () => {
        const { service, systemAdd, pbxService } = makeService({
            settings: { aiAnalyticsRopUserIds: '' },
        });
        const outcome = await service.notifyIfNeeded(
            DOMAIN,
            analysis(),
            row(),
            777,
        );
        expect(outcome.reason).toBe('no-rop');
        expect(pbxService.init).not.toHaveBeenCalled();
        expect(systemAdd).not.toHaveBeenCalled();
    });

    it('текст: менеджер, тип звонка, вид алерта, цитата, ссылка на смарт-элемент', async () => {
        const { service, systemAdd, userGet, smartResolver } = makeService();
        await service.notifyIfNeeded(DOMAIN, analysis(), row(), 777);

        expect(userGet).toHaveBeenCalledWith({ ID: '622' });
        expect(smartResolver.resolve).toHaveBeenCalledWith(DOMAIN);
        const message = sentMessage(systemAdd);
        expect(message).toContain('Менеджер: Иванов Иван');
        expect(message).toContain('Тип звонка: Презентация');
        expect(message).toContain('Сигнал: Необоснованное обещание клиенту');
        expect(message).toContain('Цитата: «Да у нас Консультант стоит»');
        expect(message).toContain(
            'Разбор: https://test.bitrix24.ru/crm/type/1056/details/777/',
        );
    });

    it('без смарт-элемента — ссылка на сделку звонка', async () => {
        const { service, systemAdd } = makeService();
        await service.notifyIfNeeded(DOMAIN, analysis(), row(), null);
        expect(sentMessage(systemAdd)).toContain(
            'Разбор: https://test.bitrix24.ru/crm/deal/details/555/',
        );
    });

    it('ошибка Bitrix (init) не бросает — статус failed, запись не пишется', async () => {
        const { service, pbxService, aiService } = makeService();
        pbxService.init.mockRejectedValue(new Error('bitrix down'));
        const outcome = await service.notifyIfNeeded(
            DOMAIN,
            analysis(),
            row(),
            777,
        );

        expect(outcome.status).toBe('failed');
        expect(outcome.reason).toBe('bitrix down');
        expect(aiService.create).not.toHaveBeenCalled();
    });

    it('сбой доставки одному РОПу не мешает остальным; в записи — только доставленные', async () => {
        const { service, systemAdd, aiService } = makeService();
        systemAdd
            .mockRejectedValueOnce(new Error('user 1 blocked'))
            .mockResolvedValueOnce({ result: 2 });
        const outcome = await service.notifyIfNeeded(
            DOMAIN,
            analysis(),
            row(),
            777,
        );

        expect(outcome).toEqual({
            status: 'sent',
            kind: 'promise',
            delivered: [42],
        });
        expect(createdRecord(aiService.create).user_result).toMatchObject({
            kind: 'alert_sent',
            payload: { alertKind: 'promise', ropUserIds: [42] },
        });
    });

    it('никому не доставлено — alert_sent не пишется (повтор возможен)', async () => {
        const { service, systemAdd, aiService } = makeService();
        systemAdd.mockRejectedValue(new Error('im down'));
        const outcome = await service.notifyIfNeeded(
            DOMAIN,
            analysis(),
            row(),
            777,
        );

        expect(outcome.status).toBe('failed');
        expect(outcome.reason).toBe('not-delivered');
        expect(aiService.create).not.toHaveBeenCalled();
    });

    it('ошибка чтения имени менеджера — «#id», алерт всё равно уходит', async () => {
        const { service, systemAdd, userGet } = makeService();
        userGet.mockRejectedValue(new Error('user.get down'));
        const outcome = await service.notifyIfNeeded(
            DOMAIN,
            analysis(),
            row(),
            777,
        );
        expect(outcome.status).toBe('sent');
        expect(sentMessage(systemAdd)).toContain('Менеджер: #622');
    });

    it('падение записи alert_sent после отправки — failed, но уведомления ушли', async () => {
        const { service, systemAdd, aiService } = makeService();
        aiService.create.mockRejectedValue(new Error('db down'));
        const outcome = await service.notifyIfNeeded(
            DOMAIN,
            analysis(),
            row(),
            777,
        );
        expect(outcome.status).toBe('failed');
        expect(systemAdd).toHaveBeenCalledTimes(2);
    });
});
