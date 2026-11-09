import type { DatedLiteRow } from '../../domain/loaders/lite-row.mapper';
import { OwnerReportReactivationLoader } from '../owner-report-reactivation.loader';

/** Записи «ОП История» типа «Отказ» — читатель списков подменён целиком. */
const mockHistoryRead = jest.fn();
jest.mock('@lib/portal-lib/pbx/pbx-sales-list-reader', () => ({
    SALES_LIST_CODES: { kpi: 'sales_kpi', history: 'sales_history' },
    SalesListReaderService: jest
        .fn()
        .mockImplementation(() => ({ read: mockHistoryRead })),
}));

const TZ = 'Europe/Moscow';

const row = (id: string, day: string): DatedLiteRow =>
    ({
        transcriptionId: id,
        callStartedAt: new Date(`${day}T10:00:00+03:00`),
    }) as DatedLiteRow;

/** Воронка «ОП Основная» (C5): отказ, не ЦА, успех, «Не беспокоить», новая. */
const CATEGORY = {
    bitrixId: 5,
    code: 'sales_base',
    stages: [
        { bitrixId: 'LOSE', code: 'sales_fail' },
        { bitrixId: 'NOT_CA', code: 'sales_not_ca' },
        { bitrixId: 'WON', code: 'sales_success' },
        { bitrixId: 'NOT_CALL', code: 'sales_not_call' },
        { bitrixId: 'NEW', code: 'sales_new' },
    ],
};

/** Поля сделки по слепку: перспективность (элементы с id) и причина отказа. */
const DEAL_FIELDS: Record<
    string,
    { bitrixId: string; items: { code: string; bitrixId: number }[] }
> = {
    op_prospects_type: {
        bitrixId: 'UF_CRM_PROSPECTS',
        items: [
            { code: 'op_prospects_good', bitrixId: 11 },
            { code: 'op_prospects_nopersp', bitrixId: 12 },
            { code: 'op_prospects_fail', bitrixId: 13 },
        ],
    },
    op_efield_fail_reason: { bitrixId: 'UF_CRM_FAIL_REASON', items: [] },
};

const makeLoader = (options: { bitrixFails?: boolean } = {}) => {
    const prisma = {
        transcription: {
            findMany: jest.fn().mockResolvedValue([
                // Звонок по компании, у которой давний отказ финалом сделки.
                { id: BigInt(1), entity_type: 'company', entity_id: '100' },
                // Звонок по сделке компании 200: отказ свежий.
                { id: BigInt(2), entity_type: 'deal', entity_id: '900' },
                // Звонок по лиду — компании нет, признака нет.
                { id: BigInt(3), entity_type: 'lead', entity_id: '55' },
                // Компания 300: давний отказ, потом продажа.
                { id: BigInt(4), entity_type: 'company', entity_id: '300' },
                // Компания 400: сделок с финалом нет, отказ — записью «ОП История».
                { id: BigInt(5), entity_type: 'company', entity_id: '400' },
                // Компания 500: сделка открыта, но помечена «Нет перспектив».
                { id: BigInt(6), entity_type: 'company', entity_id: '500' },
            ]),
        },
    };
    const all = jest.fn<
        Promise<Record<string, unknown>[]>,
        [Record<string, unknown>, string[]?]
    >(filter => {
        if (options.bitrixFails) return Promise.reject(new Error('503'));
        if ('@ID' in filter) {
            return Promise.resolve([{ ID: 900, COMPANY_ID: '200' }]);
        }
        return Promise.resolve([
            {
                ID: 1,
                COMPANY_ID: '100',
                STAGE_ID: 'C5:LOSE',
                CLOSEDATE: '2026-08-01T12:00:00+03:00',
            },
            {
                ID: 2,
                COMPANY_ID: '200',
                STAGE_ID: 'C5:NOT_CA',
                CLOSEDATE: '2026-10-05T12:00:00+03:00',
            },
            {
                ID: 3,
                COMPANY_ID: '300',
                STAGE_ID: 'C5:LOSE',
                CLOSEDATE: '2026-05-01T12:00:00+03:00',
            },
            {
                ID: 4,
                COMPANY_ID: '300',
                STAGE_ID: 'C5:WON',
                CLOSEDATE: '2026-07-01T12:00:00+03:00',
            },
            // «Не беспокоить» — не отказ: компании 100 это не меняет.
            {
                ID: 5,
                COMPANY_ID: '100',
                STAGE_ID: 'C5:NOT_CALL',
                CLOSEDATE: '2026-10-10T12:00:00+03:00',
            },
            // Открытая сделка с «Нет перспектив» — отказ по полям, дата изменения.
            {
                ID: 6,
                COMPANY_ID: '500',
                STAGE_ID: 'C5:NEW',
                CLOSEDATE: '',
                DATE_MODIFY: '2026-06-15T12:00:00+03:00',
                UF_CRM_PROSPECTS: 12,
            },
        ]);
    });
    mockHistoryRead.mockReset().mockResolvedValue([
        {
            id: '77',
            crmRefs: ['CO_400', 'D_4001'],
            eventDate: '2026-07-20T00:00:00+03:00',
            createdAt: '2026-07-21T09:00:00+03:00',
        },
        // Запись без ссылки на компанию — не к кому отнести.
        { id: '78', crmRefs: ['D_5'], eventDate: '2026-07-20T00:00:00+03:00' },
    ]);
    const portal = {
        getDealCategoryByCode: () => CATEGORY,
        getDealFieldByCode: (code: string) => DEAL_FIELDS[code],
        getFieldBitrixId: (field: { bitrixId: string }) => field.bitrixId,
    };
    const pbx = {
        init: jest.fn().mockResolvedValue({
            bitrix: { deal: { all } },
            PortalModel: portal,
        }),
    };
    const loader = new OwnerReportReactivationLoader(
        prisma as never,
        pbx as never,
    );
    return { loader, all };
};

describe('OwnerReportReactivationLoader — признак возврата по сделкам компании', () => {
    const ROWS = [
        row('1', '2026-10-20'),
        row('2', '2026-10-20'),
        row('3', '2026-10-20'),
        row('4', '2026-10-20'),
        row('5', '2026-10-20'),
        row('6', '2026-10-20'),
    ];

    it('давний отказ без продажи после — реактивация; свежий, лид и «после продажи» — нет', async () => {
        const { loader, all } = makeLoader();
        const marked = await loader.mark('gsr.bitrix24.ru', ROWS, TZ);
        expect(
            marked.slice(0, 4).map(item => item.reactivation === true),
        ).toEqual([true, false, false, false]);
        expect(marked[0].reactivationSource).toBe('stage');
        // Сделки «ОП Основная» нужных компаний, с полями отказа в select.
        const companyCall = all.mock.calls.find(
            ([filter]) => '@COMPANY_ID' in filter,
        );
        expect(companyCall?.[0]).toMatchObject({ CATEGORY_ID: 5 });
        expect(
            [...(companyCall?.[0]['@COMPANY_ID'] as string[])].sort(),
        ).toEqual(['100', '200', '300', '400', '500']);
        expect(companyCall?.[1]).toEqual(
            expect.arrayContaining(['UF_CRM_PROSPECTS', 'UF_CRM_FAIL_REASON']),
        );
    });

    it('вторичные источники: запись «ОП История» типа «Отказ» и поля сделки', async () => {
        const { loader } = makeLoader();
        const marked = await loader.mark('gsr.bitrix24.ru', ROWS, TZ);
        expect(marked[4]).toMatchObject({
            reactivation: true,
            reactivationSource: 'history',
        });
        expect(marked[5]).toMatchObject({
            reactivation: true,
            reactivationSource: 'fields',
        });
        // Записи читаются по ссылкам на компании и только типа «Отказ».
        const [listCode, query] = mockHistoryRead.mock.calls[0] as [
            string,
            { crmRefs: string[]; eventTypeCodes: string[] },
        ];
        expect(listCode).toBe('sales_history');
        expect(query.crmRefs).toEqual(
            expect.arrayContaining(['CO_100', 'CO_400']),
        );
        expect(query.eventTypeCodes).toEqual(['ev_fail']);
    });

    it('сбой Битрикса — строки без признака, отчёт не падает', async () => {
        const { loader } = makeLoader({ bitrixFails: true });
        const marked = await loader.mark('gsr.bitrix24.ru', ROWS, TZ);
        expect(marked.some(item => item.reactivation)).toBe(false);
        expect(marked).toHaveLength(6);
    });
});
