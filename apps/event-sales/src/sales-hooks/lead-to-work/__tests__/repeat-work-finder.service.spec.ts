import { RepeatWorkFinderService } from '../services/repeat-work-finder.service';

type Row = Record<string, unknown>;

/** Поля портала garant: лид и сделка (реестр pbx-sales-event-field). */
const FIELDS: Record<string, Record<string, string>> = {
    lead: {
        lead_order_number: 'ORDER_NUMBER',
        to_base_sales: 'TO_BASE_SALES',
    },
    deal: {
        lead_order_number: 'LEAD_ORDER_NUMBER',
        op_lead_phones: 'OP_LEAD_PHONES',
        op_lead_emails: 'OP_LEAD_EMAILS',
    },
};

const portal = {
    getEntityFieldByCode: (entity: string, code: string) =>
        FIELDS[entity]?.[code] ? { bitrixId: FIELDS[entity][code] } : undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
    getDealCategoryByCode: (code: string) =>
        code === 'sales_base' ? { bitrixId: '31', stages: [] } : undefined,
    getSalesTaskGroupId: () => 77,
};

interface ICommand {
    cmd: string;
    method: string;
    arg: Row;
    /** Сортировка списка (4-й аргумент getList), если передана. */
    order?: Row;
}

/**
 * Batch-мок: команды копятся, flush отдаёт ответы от `respond`. Так тест
 * видит и ЧТО спросили у портала, и сколько проводов ушло.
 */
const makeBitrix = (respond: (command: ICommand) => unknown) => {
    let queue: ICommand[] = [];
    const flushes: ICommand[][] = [];
    const push =
        (method: string) =>
        (cmd: string, arg: unknown, _select?: unknown, order?: Row): void => {
            queue.push({ cmd, method, arg: (arg ?? {}) as Row, order });
        };
    const bitrix = {
        batch: {
            deal: {
                getList: push('deal.list'),
                get: (cmd: string, id: number) =>
                    queue.push({ cmd, method: 'deal.get', arg: { id } }),
            },
            lead: { getList: push('lead.list') },
            company: { getList: push('company.list') },
            requisite: { getList: push('requisite.list') },
            duplicate: { findByComm: push('findbycomm') },
            task: { getList: push('task.list') },
        },
        api: {
            callBatchWithConcurrency: jest.fn(() => {
                const sent = queue;
                queue = [];
                flushes.push(sent);
                const result: Row = {};
                for (const command of sent) {
                    result[command.cmd] = respond(command);
                }
                return Promise.resolve([{ result }]);
            }),
        },
    };
    return { bitrix, flushes };
};

const NO_INN = { lead: [], deal: [], company: [] };

const lead = (over: Row = {}): Row => ({
    ID: '348391',
    TITLE: 'Андреева Светлана Алексеевна (3260882)',
    ...over,
});

const openDeal = (id: number, over: Row = {}): Row => ({
    ID: String(id),
    CATEGORY_ID: '31',
    CLOSED: 'N',
    STAGE_ID: 'C31:WARM',
    ASSIGNED_BY_ID: '433',
    TITLE: `Сделка ${id}`,
    ...over,
});

describe('RepeatWorkFinderService', () => {
    /*
     * Заявка 3260882 (22.09.2026): 44 лида одного номера. Первый уже
     * создал сделку 84663 — следующий должен найти её по номеру заявки.
     */
    it('номер заявки: сиблинг-лид → его сделка → join + задачи основной', async () => {
        const { bitrix, flushes } = makeBitrix(command => {
            if (command.method === 'lead.list') {
                return [
                    { ID: '348391', UF_CRM_TO_BASE_SALES: '' },
                    { ID: '348379', UF_CRM_TO_BASE_SALES: 'D_84663' },
                ];
            }
            if (command.method === 'deal.get') return openDeal(84663);
            if (command.method === 'task.list') {
                return {
                    tasks: [{ id: '5', title: 'Холодный обзвон. Заявка. X' }],
                };
            }
            return [];
        });
        const finder = new RepeatWorkFinderService(
            bitrix as never,
            portal as never,
            NO_INN,
        );

        const out = await finder.find([
            { leadId: 348391, row: lead({ UF_CRM_ORDER_NUMBER: '3260882' }) },
        ]);

        const outcome = out.get(348391)!;
        expect(outcome.resolution.kind).toBe('join');
        expect(outcome.resolution.mainDeal?.dealId).toBe(84663);
        expect(outcome.resolution.mainDeal?.responsibleId).toBe(433);
        expect(outcome.openMainTasks).toHaveLength(1);
        // Три провода: сигналы, сделки по ссылкам, задачи основной.
        expect(flushes).toHaveLength(3);
        expect(flushes[2][0].arg).toMatchObject({ UF_CRM_TASK: ['D_84663'] });
    });

    /*
     * Портал МОЛЧА игнорирует фильтр (как %PHONE/%EMAIL на контактах) и
     * отдаёт первые попавшиеся сделки — JS-перепроверка их отсеивает, и
     * ложного присоединения нет.
     */
    it('проигнорированный порталом фильтр не даёт ложного присоединения', async () => {
        const { bitrix } = makeBitrix(command => {
            if (command.method === 'deal.list') {
                return [
                    openDeal(1, { UF_CRM_OP_LEAD_PHONES: ['+79001112233'] }),
                    openDeal(2, { UF_CRM_OP_LEAD_PHONES: [] }),
                ];
            }
            if (command.method === 'findbycomm') return {};
            return [];
        });
        const finder = new RepeatWorkFinderService(
            bitrix as never,
            portal as never,
            NO_INN,
        );

        const out = await finder.find([
            {
                leadId: 1,
                row: lead({ PHONE: [{ VALUE: '+7 (968) 754-74-21' }] }),
            },
        ]);
        expect(out.get(1)!.resolution.kind).toBe('none');
    });

    it('телефон в строковом поле сделки находит её (после перепроверки)', async () => {
        const { bitrix } = makeBitrix(command => {
            if (command.method === 'deal.list') {
                return [
                    openDeal(87955, {
                        UF_CRM_OP_LEAD_PHONES: ['+79525932773'],
                    }),
                ];
            }
            if (command.method === 'findbycomm') return {};
            return [];
        });
        const finder = new RepeatWorkFinderService(
            bitrix as never,
            portal as never,
            NO_INN,
        );
        const out = await finder.find([
            { leadId: 9, row: lead({ PHONE: [{ VALUE: '89525932773' }] }) },
        ]);
        expect(out.get(9)!.resolution).toMatchObject({
            kind: 'join',
            signal: 'phone',
        });
    });

    it('домен почты: только корпоративный, и только совпавшие сделки', async () => {
        const { bitrix, flushes } = makeBitrix(command => {
            const filter = command.arg;
            if (
                command.method === 'deal.list' &&
                '%UF_CRM_OP_LEAD_EMAILS' in filter
            ) {
                return [
                    openDeal(72859, {
                        UF_CRM_OP_LEAD_EMAILS: ['YakovlevaIV@admlr.lipetsk.ru'],
                    }),
                ];
            }
            if (command.method === 'findbycomm') return {};
            return [];
        });
        const finder = new RepeatWorkFinderService(
            bitrix as never,
            portal as never,
            NO_INN,
        );
        const out = await finder.find([
            {
                leadId: 7,
                row: lead({
                    EMAIL: [
                        { VALUE: 'ryapolovain@admlr.lipetsk.ru' },
                        { VALUE: 'home@mail.ru' },
                    ],
                }),
            },
        ]);
        expect(out.get(7)!.resolution).toMatchObject({
            kind: 'join',
            signal: 'email_domain',
            value: 'admlr.lipetsk.ru',
        });
        // Бесплатный домен mail.ru поиском по домену не спрашивался.
        const likeValues = flushes
            .flat()
            .map(command => command.arg['%UF_CRM_OP_LEAD_EMAILS'])
            .filter(Boolean);
        expect(likeValues).toEqual(['@admlr.lipetsk.ru']);
    });

    /**
     * garant, 06.10.2026: заявки из мессенджеров приходят с выдуманной
     * почтой `<телефон>.<канал>.fict@garant.ru`, домен у всех один, и
     * поиск по домену склеивал разных людей в одного клиента.
     */
    it('выдуманная почта заявки и домены из списка портала — без поиска по домену', async () => {
        const { bitrix, flushes } = makeBitrix(command => {
            if (command.method === 'findbycomm') return {};
            return [];
        });
        const finder = new RepeatWorkFinderService(
            bitrix as never,
            portal as never,
            NO_INN,
            new Set(['garant-vrn.ru']),
        );
        const out = await finder.find([
            {
                leadId: 11,
                row: lead({
                    EMAIL: [
                        { VALUE: '79601159292.max.fict@garant.ru' },
                        { VALUE: 'manager@garant-vrn.ru' },
                    ],
                }),
            },
        ]);

        const likeValues = flushes
            .flat()
            .map(command => command.arg['%UF_CRM_OP_LEAD_EMAILS'])
            .filter(Boolean);
        expect(likeValues).toEqual([]);
        expect(out.get(11)!.resolution.kind).toBe('none');
    });

    it('findbycomm нашёл компанию → её открытая сделка ОП → join', async () => {
        const { bitrix } = makeBitrix(command => {
            if (command.method === 'findbycomm') return { COMPANY: [91429] };
            if (
                command.method === 'deal.list' &&
                command.arg.COMPANY_ID === 91429
            ) {
                return [openDeal(71000, { COMPANY_ID: '91429' })];
            }
            return [];
        });
        const finder = new RepeatWorkFinderService(
            bitrix as never,
            portal as never,
            NO_INN,
        );
        const out = await finder.find([
            { leadId: 3, row: lead({ EMAIL: [{ VALUE: 'x@mail.ru' }] }) },
        ]);
        expect(out.get(3)!.resolution).toMatchObject({
            kind: 'join',
            signal: 'email',
        });
        expect(out.get(3)!.resolution.mainDeal?.dealId).toBe(71000);
    });

    it('у компании только закрытые сделки → reuse-client, новая работа', async () => {
        const { bitrix } = makeBitrix(command => {
            if (command.method === 'findbycomm') return { COMPANY: [91429] };
            if (command.method === 'deal.list' && command.arg.COMPANY_ID) {
                return [openDeal(71000, { CLOSED: 'Y', COMPANY_ID: '91429' })];
            }
            return [];
        });
        const finder = new RepeatWorkFinderService(
            bitrix as never,
            portal as never,
            NO_INN,
        );
        const out = await finder.find([
            { leadId: 3, row: lead({ PHONE: [{ VALUE: '+79001234567' }] }) },
        ]);
        expect(out.get(3)!.resolution).toMatchObject({
            kind: 'reuse-client',
            companyId: 91429,
        });
    });

    it('ИНН: реквизит компании → сделка компании; ИНН из названия лида', async () => {
        const { bitrix } = makeBitrix(command => {
            if (command.method === 'requisite.list') {
                return [{ ENTITY_TYPE_ID: '4', ENTITY_ID: '91429' }];
            }
            if (command.method === 'deal.list' && command.arg.COMPANY_ID) {
                return [openDeal(71000, { COMPANY_ID: '91429' })];
            }
            return [];
        });
        const finder = new RepeatWorkFinderService(
            bitrix as never,
            portal as never,
            NO_INN,
        );
        const out = await finder.find([
            {
                leadId: 5,
                row: lead({
                    TITLE: 'Ряполова_МИНИСТЕРСТВО_ИНН_4826006839_Другое',
                }),
            },
        ]);
        expect(out.get(5)!.resolution).toMatchObject({
            kind: 'join',
            signal: 'inn',
            value: '4826006839',
        });
    });

    /*
     * Список отдаёт не больше 50 строк: у клиента с длинной историей
     * открытая работа не должна теряться за старыми сделками.
     */
    it('все списки сделок идут свежими вперёд (DATE_MODIFY DESC, затем ID DESC)', async () => {
        const { bitrix, flushes } = makeBitrix(command => {
            if (command.method === 'findbycomm') {
                return { COMPANY: [91429], CONTACT: [288609] };
            }
            return [];
        });
        const finder = new RepeatWorkFinderService(
            bitrix as never,
            portal as never,
            NO_INN,
        );
        await finder.find([
            { leadId: 4, row: lead({ PHONE: [{ VALUE: '+79001234567' }] }) },
        ]);

        const dealLists = flushes
            .flat()
            .filter(command => command.method === 'deal.list');
        // Волна 1 (строковое поле телефонов) + волна 2 (компания и контакт).
        expect(dealLists).toHaveLength(3);
        for (const command of dealLists) {
            expect(command.order).toEqual({ DATE_MODIFY: 'DESC', ID: 'DESC' });
        }
    });

    /*
     * Решение владельца 01.10.2026: несколько открытых сделок клиента —
     * заявка идёт в самую свежую, и «одна задача ХО» решается по её задачам.
     */
    it('несколько открытых сделок: выбрана самая свежая, её задачи читаются волной 3', async () => {
        const { bitrix, flushes } = makeBitrix(command => {
            if (command.method === 'findbycomm') return { COMPANY: [91429] };
            if (command.method === 'deal.list' && command.arg.COMPANY_ID) {
                return [
                    openDeal(71000, {
                        COMPANY_ID: '91429',
                        ASSIGNED_BY_ID: '433',
                        DATE_MODIFY: '2026-09-02T10:00:00+03:00',
                    }),
                    openDeal(72000, {
                        COMPANY_ID: '91429',
                        ASSIGNED_BY_ID: '455',
                        DATE_MODIFY: '2026-09-30T10:00:00+03:00',
                    }),
                ];
            }
            if (command.method === 'task.list') {
                return { tasks: [{ id: '9', title: 'Холодный обзвон' }] };
            }
            return [];
        });
        const finder = new RepeatWorkFinderService(
            bitrix as never,
            portal as never,
            NO_INN,
        );

        const out = await finder.find([
            { leadId: 6, row: lead({ EMAIL: [{ VALUE: 'x@mail.ru' }] }) },
        ]);

        const outcome = out.get(6)!;
        expect(outcome.resolution.kind).toBe('ambiguous');
        expect(outcome.resolution.mainDeal).toMatchObject({
            dealId: 72000,
            responsibleId: 455,
            modifiedAt: '2026-09-30T10:00:00+03:00',
        });
        expect(outcome.resolution.openDeals?.map(deal => deal.dealId)).toEqual([
            72000, 71000,
        ]);
        expect(outcome.openMainTasks).toHaveLength(1);
        const taskList = flushes
            .flat()
            .find(command => command.method === 'task.list');
        expect(taskList?.arg).toMatchObject({ UF_CRM_TASK: ['D_72000'] });
    });

    it('без сигналов — ни одного запроса, kind=none', async () => {
        const { bitrix, flushes } = makeBitrix(() => []);
        const finder = new RepeatWorkFinderService(
            bitrix as never,
            portal as never,
            NO_INN,
        );
        const out = await finder.find([{ leadId: 1, row: { ID: '1' } }]);
        expect(out.get(1)!.resolution.kind).toBe('none');
        expect(flushes).toHaveLength(0);
    });
});
