import { LeadToWorkDuplicateCheckService } from '../services/lead-to-work-duplicate-check.service';

/**
 * Автопроверка дублей на входе заявки: ставится один раз, только по
 * входящей работе и только когда включена настройкой портала.
 */
const CHECK_FIELD = 'UF_CRM_OP_LEAD_IS_DUPLICATE_CHECK';

const makePortal = (withField = true) => ({
    getEntityFieldByCode: (_entity: string, code: string) =>
        withField && code === 'op_lead_is_duplicate_check'
            ? { bitrixId: 'OP_LEAD_IS_DUPLICATE_CHECK', items: [] }
            : undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
});

const makeDeps = (settings: {
    enabled: boolean;
    deep?: boolean;
    withField?: boolean;
}) => {
    const appSettings = {
        resolve: jest.fn().mockResolvedValue({
            leadIntakeDuplicateCheckEnabled: settings.enabled,
            leadIntakeDuplicateCheckDeep: settings.deep ?? true,
        }),
    };
    const dispatch = {
        accept: jest.fn().mockResolvedValue({ operationId: 'op-1' }),
    };
    const idempotency = { fingerprint: jest.fn().mockReturnValue('fp') };
    const service = new LeadToWorkDuplicateCheckService(
        appSettings as never,
        dispatch as never,
        idempotency as never,
    );
    return {
        service,
        dispatch,
        appSettings,
        portal: makePortal(settings.withField ?? true) as never,
    };
};

const incoming = (row: Record<string, unknown> = {}) => ({
    leadId: 42,
    leadRow: { ID: '42', ...row },
    isIncoming: true,
});

describe('LeadToWorkDuplicateCheckService', () => {
    it('входящая заявка + настройка включена → проверка ставится (deep)', async () => {
        const { service, dispatch, portal } = makeDeps({ enabled: true });

        const warnings = await service.queueForLeads('d.b24.ru', portal, [
            incoming(),
        ]);

        expect(warnings).toEqual([]);
        const [hook, , , items] = dispatch.accept.mock.calls[0] as [
            string,
            string,
            string,
            { data: Record<string, unknown> }[],
        ];
        expect(hook).toBe('duplicate-check');
        expect(items[0].data).toMatchObject({
            entityType: 'lead',
            entityId: 42,
            level: 'deep',
        });
    });

    it('настройка выключена → ни одного вызова', async () => {
        const { service, dispatch, portal } = makeDeps({ enabled: false });

        await service.queueForLeads('d.b24.ru', portal, [incoming()]);

        expect(dispatch.accept).not.toHaveBeenCalled();
    });

    /*
     * Конвертация идёт по клиенту, которого уже ведут: там проверка
     * бессмысленна и только жжёт запросы к порталу.
     */
    it('не входящая работа (конвертация) не проверяется', async () => {
        const { service, dispatch, portal, appSettings } = makeDeps({
            enabled: true,
        });

        await service.queueForLeads('d.b24.ru', portal, [
            { ...incoming(), isIncoming: false },
        ]);

        expect(dispatch.accept).not.toHaveBeenCalled();
        // Настройки даже не читаем — нечего проверять.
        expect(appSettings.resolve).not.toHaveBeenCalled();
    });

    /*
     * Гейт по маркеру: иначе каждая передача заявки другому менеджеру
     * гоняла бы тяжёлый DEEP-поиск заново.
     */
    it('дубли уже проверялись (маркер стоит) → повторно не ставим', async () => {
        const { service, dispatch, portal } = makeDeps({ enabled: true });

        await service.queueForLeads('d.b24.ru', portal, [
            incoming({ [CHECK_FIELD]: '1' }),
        ]);

        expect(dispatch.accept).not.toHaveBeenCalled();
    });

    it('поле маркера не установлено → проверка всё равно ставится', async () => {
        const { service, dispatch, portal } = makeDeps({
            enabled: true,
            withField: false,
        });

        await service.queueForLeads('d.b24.ru', portal, [incoming()]);

        expect(dispatch.accept).toHaveBeenCalledTimes(1);
    });

    it('быстрый режим настройкой: level=fast', async () => {
        const { service, dispatch, portal } = makeDeps({
            enabled: true,
            deep: false,
        });

        await service.queueForLeads('d.b24.ru', portal, [incoming()]);

        const [, , , items] = dispatch.accept.mock.calls[0] as [
            string,
            string,
            string,
            { data: Record<string, unknown> }[],
        ];
        expect(items[0].data.level).toBe('fast');
    });

    it('операция уже выполняется → предупреждение, а не падение', async () => {
        const { service, dispatch, portal } = makeDeps({ enabled: true });
        dispatch.accept.mockResolvedValueOnce(null);

        const warnings = await service.queueForLeads('d.b24.ru', portal, [
            incoming(),
        ]);

        expect(warnings.join(' ')).toContain('уже выполняется');
    });
});
