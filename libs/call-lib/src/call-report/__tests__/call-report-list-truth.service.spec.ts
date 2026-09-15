import { Logger } from '@nestjs/common';
import { CallReportListTruthService } from '../services/call-report-list-truth.service';
import {
    buildCallCrmRefs,
    callListEventTime,
    parseCrmRef,
    rankCallListRecords,
} from '../services/call-report-list-truth.types';
import {
    makeSalesList,
    SALES_CATEGORIES,
    salesListFieldByCode,
    salesListItem as item,
} from './fixtures/sales-list.fixture';

/**
 * §4 прод-фиксов: элемент «ОП История» — источник истины для связей.
 * Мокается только транспорт Битрикса (lists.element.get / crm.deal.get) и
 * слепок портала; сам читатель списков и раскладка воронок — рабочий код.
 */

const CALL_AT = new Date('2026-09-14T09:00:00Z');

interface Options {
    kpi?: Record<string, unknown>[];
    history?: Record<string, unknown>[];
    deals?: Record<string, Record<string, unknown> | null>;
    /** Списки не заведены в слепке портала. */
    listsMissing?: boolean;
    /** lists.element.get падает. */
    listsError?: boolean;
}

const makeService = (options: Options = {}) => {
    const lists: Record<string, ReturnType<typeof makeSalesList>> = {
        sales_kpi: makeSalesList('kpi'),
        sales_history: makeSalesList('history'),
    };
    const itemsByIblock: Record<string, Record<string, unknown>[]> = {
        '10': options.kpi ?? [],
        '20': options.history ?? [],
    };
    const filters: Record<string, unknown>[] = [];
    const get = jest.fn((payload: Record<string, unknown>) => {
        if (options.listsError) return Promise.reject(new Error('lists down'));
        filters.push(payload);
        return Promise.resolve({
            result: itemsByIblock[String(payload.IBLOCK_ID)] ?? [],
        });
    });
    const call = jest.fn((method: string, data: Record<string, unknown>) => {
        if (method === 'crm.deal.get') {
            return Promise.resolve({
                result: (options.deals ?? {})[String(data.id)] ?? null,
            });
        }
        return Promise.resolve({ result: null });
    });
    const bitrix = { listItem: { get }, api: { call } };
    const portal = {
        getListByCode: jest.fn((code: string) =>
            options.listsMissing ? undefined : lists[code],
        ),
        getIdByCodeFieldList: jest.fn(salesListFieldByCode),
        getDealCategoryByCode: jest.fn(
            (code: string) => SALES_CATEGORIES[code],
        ),
        // Поля «ОП История» карточки — для перекрёстной проверки связей.
        getEntityFieldByCode: jest.fn((_entity: string, code: string) =>
            code === 'op_history' || code === 'op_mhistory'
                ? { code }
                : undefined,
        ),
        getFieldBitrixId: jest.fn((field: { code: string }) =>
            field.code === 'op_history'
                ? 'UF_CRM_OP_HISTORY'
                : 'UF_CRM_OP_MHISTORY',
        ),
    };
    const logger = {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    };
    const service = new CallReportListTruthService(
        bitrix as never,
        portal as never,
        logger as unknown as Logger,
    );
    return { service, logger, filters, call };
};

/** Вход поиска по звонку из сделки-презентации 601 компании 232232. */
const input = (overrides?: Record<string, unknown>) => ({
    entityType: 'deal' as const,
    entityId: 601,
    companyId: 232232,
    contactId: 44,
    callStartedAt: CALL_AT,
    callerId: '622',
    callType: 'call',
    ...overrides,
});

describe('CallReportListTruthService — семья сущностей из элемента списка', () => {
    it('запись с полной семьёй даёт точные связи: основная, презентация, лид, компания, контакт', async () => {
        const { service } = makeService({
            history: [
                item({
                    id: 9001,
                    crm: ['D_175244', 'D_601', 'L_77', 'CO_232232', 'C_44'],
                }),
            ],
            deals: {
                '175244': { ID: '175244', CATEGORY_ID: '0' },
                '601': { ID: '601', CATEGORY_ID: '12' },
            },
        });

        const family = await service.resolve(input());

        expect(family).toMatchObject({
            recordId: '9001',
            listCode: 'sales_history',
            mainDealId: 175244,
            presentationDealId: 601,
            leadId: 77,
            companyId: 232232,
            contactId: 44,
            conflicts: [],
        });
        // Строка основной сделки возвращается читателю, чтобы он не читал
        // её повторно ради дочерних связей.
        expect(family?.mainDeal).toEqual({ ID: '175244', CATEGORY_ID: '0' });
    });

    it('звонок по ЛИДУ: запись ищется по ссылке лида и отдаёт сделку «ОП Основная»', async () => {
        const { service, filters } = makeService({
            history: [item({ id: 9002, crm: ['D_175244', 'L_77'] })],
            deals: { '175244': { ID: '175244', CATEGORY_ID: '0' } },
        });

        const family = await service.resolve(
            input({
                entityType: 'lead',
                entityId: 77,
                companyId: null,
                contactId: null,
            }),
        );

        expect(family?.mainDealId).toBe(175244);
        expect(
            (filters[0].filter as Record<string, unknown>).PROPERTY_5,
        ).toEqual(['L_77']);
    });

    it('звонок по КОНТАКТУ без сделки и лида: запись находится по ссылке контакта', async () => {
        const { service, filters } = makeService({
            history: [item({ id: 9003, crm: ['D_175244', 'C_44'] })],
            deals: { '175244': { ID: '175244', CATEGORY_ID: '0' } },
        });

        const family = await service.resolve(
            input({ entityType: null, entityId: null, companyId: null }),
        );

        expect(family?.mainDealId).toBe(175244);
        expect(
            (filters[0].filter as Record<string, unknown>).PROPERTY_5,
        ).toEqual(['C_44']);
    });

    it('две сделки «ОП Основная» в одном элементе: предупреждение и ПУСТАЯ связь, а не молчаливый выбор', async () => {
        const { service, logger } = makeService({
            history: [
                item({ id: 9004, crm: ['D_175244', 'D_175300', 'D_601'] }),
            ],
            deals: {
                '175244': { ID: '175244', CATEGORY_ID: '0' },
                '175300': { ID: '175300', CATEGORY_ID: '0' },
                '601': { ID: '601', CATEGORY_ID: '12' },
            },
        });

        const family = await service.resolve(input());

        expect(family?.mainDealId).toBeUndefined();
        expect(family?.conflicts).toEqual([
            { category: 'sales_base', dealIds: [175244, 175300] },
        ]);
        // Презентационная связь при этом остаётся: конфликт локален воронке.
        expect(family?.presentationDealId).toBe(601);
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('175244, 175300'),
        );
    });

    it('две презентационные сделки в элементе — тот же инвариант', async () => {
        const { service } = makeService({
            history: [item({ id: 9005, crm: ['D_601', 'D_602', 'D_175244'] })],
            deals: {
                '601': { ID: '601', CATEGORY_ID: '12' },
                '602': { ID: '602', CATEGORY_ID: '12' },
                '175244': { ID: '175244', CATEGORY_ID: '0' },
            },
        });

        const family = await service.resolve(input());

        expect(family?.presentationDealId).toBeUndefined();
        expect(family?.conflicts).toEqual([
            { category: 'sales_presentation', dealIds: [601, 602] },
        ]);
        expect(family?.mainDealId).toBe(175244);
    });

    it('в crm-поле записи нет сделок — деградация без падения (семья без сделок, запись известна)', async () => {
        const { service, call } = makeService({
            history: [item({ id: 9006, crm: ['CO_232232'] })],
        });

        const family = await service.resolve(input());

        expect(family).toEqual({
            recordId: '9006',
            listCode: 'sales_history',
            companyId: 232232,
            conflicts: [],
        });
        expect(call).not.toHaveBeenCalled();
    });

    it('crm-поле записи пустое совсем — раскладка пустая, без падения', async () => {
        const { service, call } = makeService();
        const family = await service.familyOf({
            id: '9100',
            listCode: 'sales_history',
            name: '',
            createdAt: null,
            eventDate: null,
            eventTypeCode: null,
            eventTypeName: null,
            eventActionCode: null,
            eventActionName: null,
            responsibleId: null,
            crmRefs: [],
            fields: [],
        });

        expect(family).toEqual({
            recordId: '9100',
            listCode: 'sales_history',
            conflicts: [],
        });
        expect(call).not.toHaveBeenCalled();
    });

    it('сделка записи не читается или чужой воронки — в семью не попадает', async () => {
        const { service } = makeService({
            history: [item({ id: 9007, crm: ['D_900', 'D_901', 'CO_232232'] })],
            deals: {
                '900': { ID: '900', CATEGORY_ID: '28' },
                '901': null,
            },
        });

        const family = await service.resolve(input());

        expect(family?.mainDealId).toBeUndefined();
        expect(family?.companyId).toBe(232232);
        expect(family?.conflicts).toEqual([]);
    });

    it('история карточки основной сделки идёт в лог как перекрёстная проверка, а не как источник связи', async () => {
        const { service, logger } = makeService({
            history: [item({ id: 9020, crm: ['D_601', 'D_175244'] })],
            deals: {
                '175244': {
                    ID: '175244',
                    CATEGORY_ID: '0',
                    UF_CRM_OP_HISTORY: '05.09 презентация|08.09 отказ',
                },
            },
        });

        const family = await service.resolve(input());

        expect(family?.mainDealId).toBe(175244);
        expect(logger.log).toHaveBeenCalledWith(
            expect.stringContaining('05.09 презентация | 08.09 отказ'),
        );
    });

    it('записи нет — null (работают запасные пути раскладки)', async () => {
        const { service } = makeService();
        expect(await service.resolve(input())).toBeNull();
    });

    it('без даты звонка и без ссылок клиента списки не читаются', async () => {
        const { service, filters } = makeService({
            history: [item({ id: 9008, crm: ['D_175244'] })],
        });

        expect(
            await service.resolve(input({ callStartedAt: null })),
        ).toBeNull();
        expect(
            await service.resolve(
                input({
                    entityType: null,
                    entityId: null,
                    companyId: null,
                    contactId: null,
                }),
            ),
        ).toBeNull();
        expect(filters).toHaveLength(0);
    });

    it('ошибка чтения списков не роняет разбор (fail-open)', async () => {
        const { service } = makeService({ listsError: true });
        const search = await service.search(input());
        expect(search.kpi).toBeNull();
        expect(search.history).toBeNull();
        expect(await service.resolve(input())).toBeNull();
    });

    it('списков нет в слепке портала — пусто, Битрикс по сделкам не дёргаем', async () => {
        const { service, call } = makeService({ listsMissing: true });
        expect(await service.resolve(input())).toBeNull();
        expect(call).not.toHaveBeenCalled();
    });

    it('«ОП История» старше «ОП KPI»: семья берётся из истории', async () => {
        const { service } = makeService({
            kpi: [item({ id: 8001, crm: ['D_601', 'D_999'] })],
            history: [item({ id: 9009, crm: ['D_601', 'D_175244'] })],
            deals: {
                '175244': { ID: '175244', CATEGORY_ID: '0' },
                '999': { ID: '999', CATEGORY_ID: '0' },
            },
        });

        const family = await service.resolve(input());

        expect(family?.recordId).toBe('9009');
        expect(family?.mainDealId).toBe(175244);
    });

    it('поиск идёт окном ±3 дня по ссылкам ЗВОНКА (сущность, компания, контакт)', async () => {
        const { service, filters } = makeService();
        const search = await service.search(input());

        expect(search.crmRefs).toEqual(['D_601', 'CO_232232', 'C_44']);
        const filter = filters[0].filter as Record<string, string[]>;
        expect(filter.PROPERTY_5).toEqual(['D_601', 'CO_232232', 'C_44']);
        expect(filter['>PROPERTY_1']).toBe('2026-09-11');
        expect(filter['<PROPERTY_1']).toBe('2026-09-17');
        expect(filters).toHaveLength(2);
    });

    it('статус привязки: совпал ответственный и день — confirmed, чужая запись — suspected', async () => {
        const { service } = makeService({
            history: [
                item({ id: 9010, crm: ['D_601'] }),
                item({
                    id: 9011,
                    crm: ['D_601'],
                    responsible: 7,
                    eventDate: '11.09.2026',
                }),
            ],
        });
        const confirmed = await service.search(input());
        expect(confirmed.history).toMatchObject({ status: 'confirmed' });
        expect(confirmed.history?.record.id).toBe('9010');
        expect(confirmed.rest.map(record => record.id)).toEqual(['9011']);

        const { service: other } = makeService({
            history: [
                item({
                    id: 9012,
                    crm: ['D_601'],
                    responsible: 7,
                    typeId: 202,
                    eventDate: '11.09.2026',
                }),
            ],
        });
        const suspected = await other.search(input());
        expect(suspected.history).toMatchObject({ status: 'suspected' });
    });

    it('записи, не ссылающиеся на клиента (сервер проигнорировал фильтр), отбрасываются', async () => {
        const { service } = makeService({
            history: [item({ id: 9013, crm: ['D_1'] })],
        });
        const search = await service.search(input());
        expect(search.history).toBeNull();
        expect(search.rest).toEqual([]);
    });
});

describe('Чистые правила поиска записи по звонку', () => {
    it('ссылки звонка строятся по типу сущности; дотянутая семья сюда не попадает', () => {
        expect(
            buildCallCrmRefs({
                entityType: 'deal',
                entityId: 601,
                companyId: 232232,
                contactId: 44,
            }),
        ).toEqual(['D_601', 'CO_232232', 'C_44']);
        expect(
            buildCallCrmRefs({
                entityType: 'lead',
                entityId: 77,
                companyId: null,
            }),
        ).toEqual(['L_77']);
        expect(buildCallCrmRefs({ entityType: null, entityId: null })).toEqual(
            [],
        );
    });

    it('разбор crm-ссылки различает компанию CO_ и контакт C_; голый id типа не несёт', () => {
        expect(parseCrmRef('D_555')).toEqual({ type: 'DEAL', id: 555 });
        expect(parseCrmRef('CO_232232')).toEqual({
            type: 'COMPANY',
            id: 232232,
        });
        expect(parseCrmRef('C_44')).toEqual({ type: 'CONTACT', id: 44 });
        expect(parseCrmRef('L_77')).toEqual({ type: 'LEAD', id: 77 });
        expect(parseCrmRef('555')).toBeNull();
        expect(parseCrmRef('X_5')).toBeNull();
    });

    it('дата события читается и в ISO, и в русском формате дд.мм.гггг', () => {
        const record = {
            eventDate: '14.09.2026',
            createdAt: '2026-09-14T08:30:00Z',
        } as never;
        expect(callListEventTime(record)).toBe(new Date(2026, 8, 14).getTime());
        expect(
            callListEventTime({
                eventDate: null,
                createdAt: '2026-09-14T08:30:00Z',
            } as never),
        ).toBe(Date.parse('2026-09-14T08:30:00Z'));
        expect(
            callListEventTime({
                eventDate: 'позавчера',
                createdAt: null,
            } as never),
        ).toBeNull();
    });

    it('ранжирование: тип события важнее ответственного, ответственный важнее близости даты', () => {
        const base = {
            listCode: 'sales_history' as const,
            name: '',
            createdAt: '2026-09-14T09:00:00Z',
            eventDate: null,
            eventTypeCode: null,
            eventTypeName: null,
            eventActionCode: null,
            eventActionName: null,
            responsibleId: null,
            crmRefs: ['D_601'],
            fields: [],
        };
        const result = rankCallListRecords({
            records: [
                { ...base, id: 'near', createdAt: '2026-09-14T09:00:00Z' },
                {
                    ...base,
                    id: 'mine',
                    responsibleId: '622',
                    createdAt: '2026-09-14T20:00:00Z',
                },
                {
                    ...base,
                    id: 'typed',
                    eventTypeCode: 'call',
                    createdAt: '2026-09-15T06:00:00Z',
                },
            ],
            crmRefs: new Set(['D_601']),
            callAt: CALL_AT.getTime(),
            callerId: '622',
            callType: 'call',
        });
        expect(result.best?.id).toBe('typed');
        expect(result.rest.map(record => record.id)).toEqual(['mine', 'near']);
        expect(result.status).toBe('confirmed');
    });
});
