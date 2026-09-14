import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { IField } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { SALES_LIST_CODES } from '@lib/portal-lib/pbx/pbx-sales-list-reader/type/sales-list-record.type';
import { AgentBitrixContextService } from '../services/agent-bitrix-context.service';

const DOMAIN = 'alfacentr.bitrix24.ru';

/**
 * Настоящий PortalModel (слепок не нужен: getFieldBitrixId читает только
 * переданное поле) — чтобы имя UF-поля в тесте считала реальная защита от
 * двойного префикса, а не копия её логики в моке.
 */
const REAL_PORTAL = new PortalModel({} as never, {} as never);

/** Строка конвейера: по умолчанию звонок по СДЕЛКЕ #900. */
const ROW = {
    id: '42',
    domain: DOMAIN,
    activityId: '101',
    callStartedAt: new Date('2026-09-08T09:00:00Z'),
    createdAt: new Date('2026-09-08T09:00:00Z'),
    entityType: 'deal',
    entityId: '900',
    userId: '222',
};

/** Воронки портала: основная — 0, презентации — 12; 28 — чужая. */
const CATEGORIES = [
    { code: 'sales_base', bitrixId: 0 },
    { code: 'sales_presentation', bitrixId: 12 },
    { code: 'sales_xo', bitrixId: 14 },
];

interface Options {
    /** Ответы crm.deal.get / crm.lead.get по id сущности. */
    entity?: Record<string, unknown> | null;
    /** Сделки по фильтру: ключ — имя поля фильтра (COMPANY_ID / CONTACT_ID). */
    deals?: Record<string, Record<string, unknown>[]>;
    /** pbx-поля компании из слепка портала для словаря агента. */
    companyFields?: IField[];
}

const makeDeps = (options: Options = {}) => {
    const call = jest.fn((method: string) => {
        if (method === 'crm.deal.get' || method === 'crm.lead.get') {
            return Promise.resolve({
                result:
                    options.entity === undefined
                        ? { COMPANY_ID: '232232', CONTACT_ID: '44' }
                        : options.entity,
            });
        }
        return Promise.resolve({ result: { ID: '1' } });
    });
    const getList = jest.fn((filter: Record<string, string>) => {
        const key = Object.keys(filter)[0];
        return Promise.resolve({ result: options.deals?.[key] ?? [] });
    });
    const bitrix = {
        api: { call },
        deal: { getList },
        listItem: { get: jest.fn().mockResolvedValue({ result: [] }) },
    };
    const portalModel = {
        getListByCode: jest.fn((code: string) => ({ bitrixId: '10', code })),
        getDealCategories: jest.fn(() => CATEGORIES),
        getCompanyFields: jest.fn(() => options.companyFields ?? []),
        // НАСТОЯЩАЯ реализация защиты от двойного префикса (мок повторять её
        // не должен — иначе тест проверял бы сам себя).
        getFieldBitrixId: jest.fn((field: IField) =>
            REAL_PORTAL.getFieldBitrixId(field),
        ),
    };
    const pbxService = {
        init: jest.fn().mockResolvedValue({ bitrix, PortalModel: portalModel }),
    };
    const service = new AgentBitrixContextService(pbxService as never);
    return { service, call, getList, portalModel };
};

describe('AgentBitrixContextService — контекст звонка для агента', () => {
    afterEach(() => jest.clearAllMocks());

    /**
     * Приёмка 08.09.2026: crm.deal.get звался с entityId ЛЮБОЙ сущности,
     * и звонок по лиду #900 подтягивал ЧУЖУЮ сделку с номером 900.
     */
    it('звонок по ЛИДУ читает лид и НЕ читает сделку с тем же номером', async () => {
        const { service, call } = makeDeps();

        const context = await service.load({
            ...ROW,
            entityType: 'lead',
        } as never);

        const methods = (call.mock.calls as unknown as [string][]).map(
            ([method]) => method,
        );
        expect(methods).toContain('crm.lead.get');
        expect(methods).not.toContain('crm.deal.get');
        expect(context.deal).toBeNull();
        expect(context.lead).not.toBeNull();
    });

    it('звонок по СДЕЛКЕ читает сделку, лид пуст', async () => {
        const { service, call } = makeDeps();

        const context = await service.load(ROW as never);

        const methods = (call.mock.calls as unknown as [string][]).map(
            ([method]) => method,
        );
        expect(methods).toContain('crm.deal.get');
        expect(methods).not.toContain('crm.lead.get');
        expect(context.lead).toBeNull();
        expect(context.deal).not.toBeNull();
    });

    /**
     * Живой случай 08.09.2026: целевая сделка «ОП Основная» стоит в
     * «Не состоялась», а кандидаты фильтровались по CLOSED !== 'Y' —
     * агенту нечего было предложить.
     */
    it('ЗАКРЫТАЯ сделка основной воронки остаётся кандидатом (открытые первыми)', async () => {
        const { service } = makeDeps({
            deals: {
                COMPANY_ID: [
                    {
                        ID: '175244',
                        CATEGORY_ID: '0',
                        CLOSED: 'Y',
                        STAGE_ID: 'C0:LOSE',
                    },
                    { ID: '175300', CATEGORY_ID: '0', CLOSED: 'N' },
                ],
            },
        });

        const context = await service.load(ROW as never);

        expect(context.dealCandidates.salesBase.map(deal => deal.ID)).toEqual([
            '175300',
            '175244',
        ]);
    });

    it('сделки ищутся и по КОНТАКТУ звонка, дубли схлопываются', async () => {
        const { service, getList } = makeDeps({
            deals: {
                COMPANY_ID: [{ ID: '175244', CATEGORY_ID: '0', CLOSED: 'Y' }],
                CONTACT_ID: [
                    { ID: '175244', CATEGORY_ID: '0', CLOSED: 'Y' },
                    { ID: '601', CATEGORY_ID: '12', CLOSED: 'N' },
                ],
            },
        });

        const context = await service.load(ROW as never);

        const filters = (
            getList.mock.calls as unknown as [Record<string, string>][]
        ).map(([filter]) => filter);
        expect(filters).toEqual([
            { COMPANY_ID: '232232' },
            { CONTACT_ID: '44' },
        ]);
        expect(context.dealCandidates.salesBase).toHaveLength(1);
        expect(context.dealCandidates.salesPresentation.map(d => d.ID)).toEqual(
            ['601'],
        );
    });

    it('сделка чужой воронки в кандидаты не попадает', async () => {
        const { service } = makeDeps({
            deals: {
                COMPANY_ID: [{ ID: '700', CATEGORY_ID: '28', CLOSED: 'N' }],
            },
        });

        const context = await service.load(ROW as never);

        expect(context.dealCandidates).toEqual({
            salesBase: [],
            salesPresentation: [],
            salesXo: [],
        });
    });

    /**
     * Аудит M15: имя UF-поля клеилось вручную (`UF_CRM_${field.bitrixId}`),
     * а konstructor-поля хранят в слепке УЖЕ полное имя — агент получал
     * несуществующий ключ `UF_CRM_UF_CRM_…` и не мог расшифровать компанию.
     */
    it('bitrixId уже с префиксом UF_CRM_ — префикс НЕ дублируется, суффиксу префикс добавляется', async () => {
        const field = (code: string, bitrixId: string): IField => ({
            type: 'string',
            code,
            name: code,
            title: code,
            bitrixId,
            bitrixCamelId: bitrixId,
            items: [],
        });
        const { service } = makeDeps({
            companyFields: [
                // konstructor-поле: в слепке лежит полное имя.
                field('contract_start', 'UF_CRM_1684144993'),
                // обычное pbx-поле: в слепке лежит суффикс.
                field('contract_type', 'CONTRACT_TYPE'),
            ],
        });

        const context = await service.load(ROW as never);

        expect(context.companyFields.map(item => item.ufId)).toEqual([
            'UF_CRM_1684144993',
            'UF_CRM_CONTRACT_TYPE',
        ]);
    });

    it('кандидаты отчётности читаются по типизированным кодам списков', async () => {
        const { service, portalModel } = makeDeps();

        await service.load(ROW as never);

        expect(
            portalModel.getListByCode.mock.calls.map(([code]) => code),
        ).toEqual([SALES_LIST_CODES.history, SALES_LIST_CODES.kpi]);
    });

    it('клиента у сущности нет — сделки-кандидаты не ищем вовсе', async () => {
        const { service, getList } = makeDeps({
            entity: { COMPANY_ID: '0', CONTACT_ID: '0' },
        });

        const context = await service.load(ROW as never);

        expect(getList).not.toHaveBeenCalled();
        expect(context.company).toBeNull();
        expect(context.contact).toBeNull();
    });
});
