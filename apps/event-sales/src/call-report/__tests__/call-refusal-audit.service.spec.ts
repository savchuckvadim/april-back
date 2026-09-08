import { CallRefusalAuditService } from '../services/call-refusal-audit.service';
import {
    MANAGER_REFUSAL_FIELDS_MISSING,
    MANAGER_REFUSAL_REASON_MISSING,
} from '../services/refusal-reason.util';

// Writer смарта — реальный класс ходит в crm.item по xmlId; здесь важен
// только вызов updateExisting с полями причины отказа.
const mockUpdateExisting = jest.fn().mockResolvedValue(undefined);
jest.mock(
    '@lib/call-lib/call-report/services/call-report-smart-writer.service',
    () => ({
        CallReportSmartWriterService: jest.fn().mockImplementation(() => ({
            updateExisting: (...args: unknown[]): Promise<void> =>
                mockUpdateExisting(...args) as Promise<void>,
        })),
    }),
);

const DOMAIN = 'alfacentr.bitrix24.ru';
const MAIN_DEAL_ID = 175244;

/** UF-имена полей причины отказа в строке сделки. */
const UF_REASON = 'UF_CRM_OP_EFIELD_FAIL_REASON';
const UF_COMMENTS = 'UF_CRM_OP_FAIL_COMMENTS';

const makeDeps = (options?: {
    /** Стадия сделки: по умолчанию финал «Не состоялась» (живой случай). */
    stageId?: string;
    /** Значение справочника «ОП Причина Отказа» (bitrixId элемента). */
    reasonItemId?: number;
    /** Комментарии отказа менеджера. */
    failComments?: string[];
    /** Поля причины отказа не заведены на портале. */
    fieldsMissing?: boolean;
    /** Причина отказа, услышанная разбором. */
    aiRefusalReason?: string | null;
    /** Записи «ОП KPI»/«ОП История» (сырой ответ lists.element.get). */
    listItems?: Record<string, unknown>[];
    /** ais-записи по транскрипции (для идемпотентности). */
    records?: Record<string, unknown>[];
    /** Раскладка связей: сделка «ОП Основная». */
    mainDealId?: number | undefined;
}) => {
    const dealRow: Record<string, unknown> = {
        ID: String(MAIN_DEAL_ID),
        CATEGORY_ID: 0,
        STAGE_ID: options?.stageId ?? 'APOLOGY',
    };
    if (options?.reasonItemId) dealRow[UF_REASON] = options.reasonItemId;
    if (options?.failComments) dealRow[UF_COMMENTS] = options.failComments;

    const api = { call: jest.fn().mockResolvedValue({ result: dealRow }) };
    const listItemGet = jest
        .fn()
        .mockResolvedValue({ result: options?.listItems ?? [] });

    // Список отчётности: единственное содержательное поле — причина отказа.
    const salesList = {
        group: 'sales',
        type: 'kpi',
        bitrixId: '10',
        bitrixfields: [
            {
                code: 'op_fail_reason',
                name: 'ОП Причина Отказа',
                bitrixId: 'PROPERTY_9',
                bitrixCamelId: 'property9',
                items: [{ code: 'nomoney', name: 'Нет денег', bitrixId: 301 }],
            },
        ],
    };
    const dealFields: Record<string, unknown> = {
        op_efield_fail_reason: {
            code: 'op_efield_fail_reason',
            bitrixId: UF_REASON,
            items: [
                {
                    code: 'op_efield_fail_nomoney',
                    name: 'Нет денег',
                    bitrixId: 77,
                },
            ],
        },
        op_fail_comments: {
            code: 'op_fail_comments',
            bitrixId: UF_COMMENTS,
            items: [],
        },
    };
    const portal = {
        getEntityFieldByCode: jest.fn((entity: string, code: string) =>
            options?.fieldsMissing ? undefined : dealFields[code],
        ),
        getFieldBitrixId: jest.fn(
            (field: { bitrixId: string }) => field.bitrixId,
        ),
        getDealCategories: jest.fn(() => [
            {
                bitrixId: '0',
                code: 'sales_base',
                stages: [
                    { code: 'sales_pres', bitrixId: 'PREPARATION' },
                    { code: 'sales_fail', bitrixId: 'LOSE' },
                    { code: 'sales_double', bitrixId: 'APOLOGY' },
                ],
            },
        ]),
        getListByCode: jest.fn(() => salesList),
        getIdByCodeFieldList: jest.fn(() => undefined),
    };
    const pbxService = {
        init: jest.fn().mockResolvedValue({
            bitrix: { api, listItem: { get: listItemGet } },
            PortalModel: portal,
        }),
    };
    const transcriptionStore = {
        findDoneInPeriod: jest.fn().mockResolvedValue([
            {
                id: '42',
                domain: DOMAIN,
                activityId: '901',
                entityType: 'deal',
                entityId: '601',
                callStartedAt: new Date('2026-09-08T09:36:00Z'),
            },
        ]),
    };
    const aiService = {
        findByTranscriptionIds: jest.fn().mockResolvedValue(
            options?.records ?? [
                {
                    transcription_id: '42',
                    type: 'agent-analysis',
                    user_result: {
                        callType: 'decision',
                        refusalReason:
                            options?.aiRefusalReason === undefined
                                ? 'Работают с «Консультантом», договор оплачен до декабря'
                                : options.aiRefusalReason,
                    },
                },
            ],
        ),
        create: jest.fn().mockResolvedValue({ id: '99' }),
    };
    const smartResolver = {
        resolve: jest.fn().mockResolvedValue({ entityTypeId: 1064 }),
    };
    const dealFamily = {
        resolve: jest.fn().mockResolvedValue({
            mainDealId:
                options && 'mainDealId' in options
                    ? options.mainDealId
                    : MAIN_DEAL_ID,
        }),
    };
    const service = new CallRefusalAuditService(
        pbxService as never,
        transcriptionStore as never,
        aiService as never,
        smartResolver as never,
        dealFamily as never,
    );
    return { service, aiService, api, listItemGet, dealFamily };
};

const run = (service: CallRefusalAuditService) =>
    service.runForDomain(
        DOMAIN,
        new Date('2026-09-07T00:00:00Z'),
        new Date('2026-09-09T00:00:00Z'),
    );

/** Поля, ушедшие в смарт последним вызовом writer.updateExisting. */
const writtenFields = (): Record<string, unknown> => {
    const calls = mockUpdateExisting.mock.calls as Record<string, unknown>[][];
    return calls[calls.length - 1][0];
};

describe('CallRefusalAuditService (сверка причины отказа)', () => {
    afterEach(() => jest.clearAllMocks());

    it('закрытие отказом с ЗАПОЛНЕННЫМ полем причины — расхождения нет', async () => {
        const { service } = makeDeps({ reasonItemId: 77 });

        const result = await run(service);

        expect(result.audited).toBe(1);
        expect(result.mismatched).toBe(0);
        expect(writtenFields().refusalMismatch).toBe(false);
        // Значение справочника ушло в карточку именем, а не bitrixId.
        expect(writtenFields().refusalReasonManager).toBe('Нет денег');
    });

    it('закрытие отказом с ПУСТЫМ полем и внятной причиной в разговоре — расхождение и текст AI', async () => {
        const { service, aiService } = makeDeps();

        const result = await run(service);

        expect(result.mismatched).toBe(1);
        const fields = writtenFields();
        expect(fields.refusalMismatch).toBe(true);
        expect(fields.refusalReasonManager).toBe(
            MANAGER_REFUSAL_REASON_MISSING,
        );
        expect(fields.refusalReasonAi).toContain('Консультантом');
        expect(String(fields.refusalReasonNote)).toContain('Консультантом');
        // Вердикт лёг в ais — он же маркер идемпотентности.
        expect(aiService.create).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'call-refusal-audit' }),
        );
    });

    it('комментарий из одного слова «Отказ» заполнением не считается', async () => {
        const { service } = makeDeps({ failComments: ['08.09 отказ'] });

        const result = await run(service);

        expect(result.mismatched).toBe(1);
        expect(writtenFields().refusalMismatch).toBe(true);
    });

    it('причину нашли в записи «ОП KPI» — расхождения нет', async () => {
        const { service } = makeDeps({
            listItems: [
                { ID: '5001', NAME: 'Отказ', PROPERTY_9: { 1: '301' } },
            ],
        });

        const result = await run(service);

        expect(result.mismatched).toBe(0);
        expect(writtenFields().refusalReasonManager).toBe('Нет денег');
    });

    it('портал без полей причины отказа — штатная деградация без расхождения', async () => {
        const { service } = makeDeps({ fieldsMissing: true });

        const result = await run(service);

        expect(result.audited).toBe(1);
        expect(result.mismatched).toBe(0);
        expect(writtenFields().refusalMismatch).toBe(false);
        expect(writtenFields().refusalReasonManager).toBe(
            MANAGER_REFUSAL_FIELDS_MISSING,
        );
    });

    it('сделка НЕ закрыта отказом — вердикт не пишется вовсе', async () => {
        const { service, aiService } = makeDeps({ stageId: 'PREPARATION' });

        const result = await run(service);

        expect(result.audited).toBe(0);
        expect(aiService.create).not.toHaveBeenCalled();
        expect(mockUpdateExisting).not.toHaveBeenCalled();
    });

    it('сделки «ОП Основная» не нашли — наугад не сверяем', async () => {
        const { service, aiService, api } = makeDeps({ mainDealId: undefined });

        const result = await run(service);

        expect(result.audited).toBe(0);
        expect(api.call).not.toHaveBeenCalled();
        expect(aiService.create).not.toHaveBeenCalled();
    });

    it('уже сверенный звонок пропускается (идемпотентность)', async () => {
        const { service, aiService } = makeDeps({
            records: [
                {
                    transcription_id: '42',
                    type: 'agent-analysis',
                    user_result: {},
                },
                { transcription_id: '42', type: 'call-refusal-audit' },
            ],
        });

        const result = await run(service);

        expect(result.skippedDone).toBe(1);
        expect(result.candidates).toBe(0);
        expect(aiService.create).not.toHaveBeenCalled();
    });

    it('ошибка чтения сделки не роняет прогон домена (fail-open)', async () => {
        const { service, api } = makeDeps();
        api.call.mockRejectedValue(new Error('bitrix down'));

        const result = await run(service);

        expect(result.failed).toBe(1);
        expect(result.audited).toBe(0);
    });
});
