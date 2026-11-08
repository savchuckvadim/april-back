import type { DatedLiteRow } from '../../domain/loaders/lite-row.mapper';
import { OwnerReportReactivationLoader } from '../owner-report-reactivation.loader';

const TZ = 'Europe/Moscow';

const row = (id: string, day: string): DatedLiteRow =>
    ({
        transcriptionId: id,
        callStartedAt: new Date(`${day}T10:00:00+03:00`),
    }) as DatedLiteRow;

/** Воронка «ОП Основная» (C5): отказ, не ЦА, успех, «Не беспокоить». */
const CATEGORY = {
    bitrixId: 5,
    code: 'sales_base',
    stages: [
        { bitrixId: 'LOSE', code: 'sales_fail' },
        { bitrixId: 'NOT_CA', code: 'sales_not_ca' },
        { bitrixId: 'WON', code: 'sales_success' },
        { bitrixId: 'NOT_CALL', code: 'sales_not_call' },
    ],
};

const makeLoader = (options: { bitrixFails?: boolean } = {}) => {
    const prisma = {
        transcription: {
            findMany: jest.fn().mockResolvedValue([
                // Звонок по компании, у которой давний отказ.
                { id: BigInt(1), entity_type: 'company', entity_id: '100' },
                // Звонок по сделке компании 200: отказ свежий.
                { id: BigInt(2), entity_type: 'deal', entity_id: '900' },
                // Звонок по лиду — компании нет, признака нет.
                { id: BigInt(3), entity_type: 'lead', entity_id: '55' },
                // Компания 300: давний отказ, потом продажа.
                { id: BigInt(4), entity_type: 'company', entity_id: '300' },
            ]),
        },
    };
    const all = jest.fn((filter: Record<string, unknown>) => {
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
        ]);
    });
    const pbx = {
        init: jest.fn().mockResolvedValue({
            bitrix: { deal: { all } },
            PortalModel: { getDealCategoryByCode: () => CATEGORY },
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
    ];

    it('давний отказ без продажи после — реактивация; свежий, лид и «после продажи» — нет', async () => {
        const { loader, all } = makeLoader();
        const marked = await loader.mark('gsr.bitrix24.ru', ROWS, TZ);
        expect(marked.map(item => item.reactivation === true)).toEqual([
            true,
            false,
            false,
            false,
        ]);
        // Только закрытые сделки «ОП Основная» нужных компаний.
        const companyCall = all.mock.calls.find(
            ([filter]) => '@COMPANY_ID' in filter,
        );
        expect(companyCall?.[0]).toMatchObject({ CATEGORY_ID: 5, CLOSED: 'Y' });
        expect(
            [...(companyCall?.[0]['@COMPANY_ID'] as string[])].sort(),
        ).toEqual(['100', '200', '300']);
    });

    it('сбой Битрикса — строки без признака, отчёт не падает', async () => {
        const { loader } = makeLoader({ bitrixFails: true });
        const marked = await loader.mark('gsr.bitrix24.ru', ROWS, TZ);
        expect(marked.some(item => item.reactivation)).toBe(false);
        expect(marked).toHaveLength(4);
    });
});
