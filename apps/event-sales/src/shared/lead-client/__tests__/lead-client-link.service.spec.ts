import { LeadClientLinkService } from '../lead-client-link.service';

type Row = Record<string, unknown>;

interface ICall {
    method: string;
    params: Row;
}

/**
 * Битрикс-заглушка с состоянием: лиды, клиенты, контакты сделки и привязки
 * дел живут в памяти, чтобы проверять не только «что вызвали», но и
 * повторный прогон.
 */
function makePortal(state: {
    leads: Record<number, Row>;
    contacts?: Record<number, Row>;
    companies?: Record<number, Row>;
    dealContacts?: number[];
    /** Контакты лида: главный и привязанные к нему. */
    leadContacts?: Record<number, number[]>;
    activities?: Record<number, number[]>;
    /** Имитация Битрикса: копировать телефоны лида при первой привязке. */
    copyOnBind?: boolean;
}) {
    const calls: ICall[] = [];
    const contacts = state.contacts ?? {};
    const companies = state.companies ?? {};
    const dealContacts = state.dealContacts ?? [];
    const bindings = new Map<number, string[]>();
    let nextId = 900;

    const store = (kind: string): Record<number, Row> =>
        kind === 'contact' ? contacts : companies;

    const call = (method: string, params: Row): Promise<unknown> => {
        calls.push({ method, params });
        const fields = (params.fields ?? {}) as Row;
        const id = Number(params.id);
        const [, kind, action] = method.split('.');
        let result: unknown = true;

        if (method === 'crm.lead.get') result = state.leads[id];
        else if (method === 'crm.lead.update') {
            const lead = state.leads[id];
            for (const key of ['CONTACT_ID', 'COMPANY_ID'] as const) {
                if (!fields[key]) continue;
                lead[key] = fields[key];
                if (state.copyOnBind) {
                    const client = store(
                        key === 'CONTACT_ID' ? 'contact' : 'company',
                    )[Number(fields[key])];
                    client.PHONE = lead.PHONE;
                }
            }
        } else if (method === 'crm.lead.contact.items.get') {
            result = (state.leadContacts?.[id] ?? []).map(CONTACT_ID => ({
                CONTACT_ID,
            }));
        } else if (method === 'crm.deal.contact.items.get') {
            result = dealContacts.map(CONTACT_ID => ({ CONTACT_ID }));
        } else if (method === 'crm.deal.contact.add') {
            dealContacts.push(Number(fields.CONTACT_ID));
        } else if (method === 'crm.activity.list') {
            // Дела ищутся по привязкам: владельца Битрикс меняет при binding.add.
            const [binding] = (params.filter as { BINDINGS: Row[] }).BINDINGS;
            result = (state.activities?.[Number(binding.OWNER_ID)] ?? []).map(
                ID => ({ ID }),
            );
        } else if (method === 'crm.activity.binding.list') {
            result = (bindings.get(Number(params.activityId)) ?? []).map(
                key => {
                    const [entityTypeId, entityId] = key.split(':');
                    return { entityTypeId, entityId };
                },
            );
        } else if (method === 'crm.activity.binding.add') {
            const list = bindings.get(Number(params.activityId)) ?? [];
            list.push(
                `${String(params.entityTypeId)}:${String(params.entityId)}`,
            );
            bindings.set(Number(params.activityId), list);
        } else if (action === 'list') {
            const filter = params.filter as Row;
            result = Object.entries(store(kind))
                .filter(
                    ([, row]) =>
                        row.ORIGINATOR_ID === filter.ORIGINATOR_ID &&
                        row.ORIGIN_ID === filter.ORIGIN_ID,
                )
                .map(([ID]) => ({ ID }));
        } else if (action === 'add') {
            nextId += 1;
            store(kind)[nextId] = { ...fields };
            result = nextId;
        } else if (action === 'get') {
            result = store(kind)[id];
        } else if (action === 'update' && kind !== 'deal') {
            const row = store(kind)[id];
            for (const key of ['PHONE', 'EMAIL']) {
                if (fields[key]) {
                    row[key] = [
                        ...((row[key] as Row[]) ?? []),
                        ...(fields[key] as Row[]),
                    ];
                }
            }
        }
        return Promise.resolve({ result });
    };

    return {
        bitrix: { api: { call } },
        calls,
        contacts,
        companies,
        dealContacts,
        bindings,
    };
}

const BARE_LEAD: Row = {
    ID: '42',
    TITLE: 'Заявка с сайта',
    NAME: 'Иван',
    LAST_NAME: 'Петров',
    ASSIGNED_BY_ID: '5',
    PHONE: [{ VALUE: '+79102880648', VALUE_TYPE: 'WORK' }],
    EMAIL: [{ VALUE: 'client@example.com', VALUE_TYPE: 'WORK' }],
};

const OPTIONS = { kind: 'contact', activitiesLimit: 50 } as const;

const DEAL: Row = { ID: '100', ASSIGNED_BY_ID: '7' };

describe('LeadClientLinkService', () => {
    it('голый лид → контакт с ФИО, телефоном и почтой, привязан к лиду и сделке', async () => {
        const portal = makePortal({ leads: { 42: { ...BARE_LEAD } } });
        const service = new LeadClientLinkService(portal.bitrix);

        const result = await service.link(100, DEAL, [42], OPTIONS);

        expect(result.created).toEqual([
            { leadId: 42, type: 'contact', id: 901, reused: false },
        ]);
        const contact = portal.contacts[901];
        expect(contact).toMatchObject({
            NAME: 'Иван',
            LAST_NAME: 'Петров',
            // Метка «создан из лида» — LEAD_ID у контакта только для чтения.
            ORIGINATOR_ID: 'april-lead',
            ORIGIN_ID: '42',
            // Ответственный — сделки: работу ведёт он.
            ASSIGNED_BY_ID: 7,
        });
        expect(contact.PHONE).toEqual([
            { VALUE: '+79102880648', VALUE_TYPE: 'WORK' },
        ]);
        expect(contact.EMAIL).toEqual([
            { VALUE: 'client@example.com', VALUE_TYPE: 'WORK' },
        ]);
        expect(result.dealContactsAdded).toEqual([901]);
        expect(portal.dealContacts).toEqual([901]);
    });

    /*
     * Опыт 17.09.2026: Битрикс сам копирует телефоны в привязанного клиента.
     * Дописывать их второй раз нельзя — появятся дубли номеров.
     */
    it('телефоны, скопированные Битриксом, не дублируются', async () => {
        const portal = makePortal({
            leads: { 42: { ...BARE_LEAD } },
            copyOnBind: true,
        });
        const service = new LeadClientLinkService(portal.bitrix);

        await service.link(100, DEAL, [42], OPTIONS);

        const contact = portal.contacts[901];
        expect(contact.PHONE).toHaveLength(1);
        // Почту Битрикс в имитации не копировал — её дописали мы.
        expect(contact.EMAIL).toHaveLength(1);
    });

    it('повторный прогон не создаёт второй контакт', async () => {
        const portal = makePortal({ leads: { 42: { ...BARE_LEAD } } });
        const service = new LeadClientLinkService(portal.bitrix);

        await service.link(100, DEAL, [42], OPTIONS);
        const second = await service.link(100, DEAL, [42], OPTIONS);

        expect(Object.keys(portal.contacts)).toEqual(['901']);
        expect(second.created).toEqual([]);
        expect(second.dealContactsAdded).toEqual([]);
    });

    /*
     * Контакт создан, а привязать к лиду не успели (падение между шагами) —
     * следующий прогон находит его по метке источника, а не создаёт второй.
     */
    it('недопривязанный контакт находится по метке источника', async () => {
        const portal = makePortal({
            leads: { 42: { ...BARE_LEAD } },
            contacts: {
                500: {
                    ORIGINATOR_ID: 'april-lead',
                    ORIGIN_ID: '42',
                    NAME: 'Иван',
                },
                // Чужая метка с тем же номером — не наш клиент.
                501: { ORIGINATOR_ID: 'other', ORIGIN_ID: '42' },
            },
        });
        const service = new LeadClientLinkService(portal.bitrix);

        const result = await service.link(100, DEAL, [42], OPTIONS);

        expect(result.created).toEqual([
            { leadId: 42, type: 'contact', id: 500, reused: true },
        ]);
        expect(Object.keys(portal.contacts)).toEqual(['500', '501']);
    });

    /*
     * У заявки бывает несколько человек (директор, бухгалтерия). При
     * переводе в работу к сделке должны приехать ВСЕ контакты лида, а не
     * только главный (решение владельца 18.09.2026).
     */
    it('все контакты лида прикрепляются к сделке', async () => {
        const portal = makePortal({
            leads: { 42: { ...BARE_LEAD, CONTACT_ID: '77' } },
            leadContacts: { 42: [77, 78] },
        });
        const service = new LeadClientLinkService(portal.bitrix);

        const result = await service.link(100, DEAL, [42], OPTIONS);

        expect(portal.dealContacts).toEqual([77, 78]);
        expect(result.dealContactsAdded).toEqual([77, 78]);
        expect(portal.calls.some(c => c.method === 'crm.contact.add')).toBe(
            false,
        );
    });

    it('лид с контактом — контакт только привязывается к сделке', async () => {
        const portal = makePortal({
            leads: { 42: { ...BARE_LEAD, CONTACT_ID: '77' } },
        });
        const service = new LeadClientLinkService(portal.bitrix);

        const result = await service.link(100, DEAL, [42], OPTIONS);

        expect(result.created).toEqual([]);
        expect(portal.dealContacts).toEqual([77]);
        expect(portal.calls.some(c => c.method === 'crm.contact.add')).toBe(
            false,
        );
    });

    it('компания лида ставится сделке без компании, чужая не подменяется', async () => {
        const empty = makePortal({
            leads: { 42: { ...BARE_LEAD, COMPANY_ID: '8' } },
        });
        const first = await new LeadClientLinkService(empty.bitrix).link(
            100,
            DEAL,
            [42],
            OPTIONS,
        );
        expect(first.dealCompanySet).toBe(8);

        const busy = makePortal({
            leads: { 42: { ...BARE_LEAD, COMPANY_ID: '8' } },
        });
        const second = await new LeadClientLinkService(busy.bitrix).link(
            100,
            { ...DEAL, COMPANY_ID: '3' },
            [42],
            OPTIONS,
        );
        expect(second.dealCompanySet).toBeNull();
        expect(busy.calls.some(c => c.method === 'crm.deal.update')).toBe(
            false,
        );
        expect(second.warnings[0]).toContain('не меняем');
    });

    it('kind=company: голый лид становится компанией с названием из лида', async () => {
        const portal = makePortal({
            leads: { 42: { ...BARE_LEAD, COMPANY_TITLE: 'ООО «Ромашка»' } },
        });
        const service = new LeadClientLinkService(portal.bitrix);

        const result = await service.link(100, DEAL, [42], {
            ...OPTIONS,
            kind: 'company',
        });

        expect(result.created[0]).toMatchObject({ type: 'company' });
        expect(portal.companies[901]).toMatchObject({ TITLE: 'ООО «Ромашка»' });
        expect(result.dealCompanySet).toBe(901);
    });

    it('kind=company и у сделки есть компания — лид привязывается к ней', async () => {
        const portal = makePortal({
            leads: { 42: { ...BARE_LEAD } },
            companies: { 3: { TITLE: 'Клиент сделки' } },
        });
        const service = new LeadClientLinkService(portal.bitrix);

        const result = await service.link(
            100,
            { ...DEAL, COMPANY_ID: '3' },
            [42],
            {
                ...OPTIONS,
                kind: 'company',
            },
        );

        expect(result.created).toEqual([]);
        expect(portal.calls.some(c => c.method === 'crm.company.add')).toBe(
            false,
        );
        expect(portal.companies[3].PHONE).toHaveLength(1);
    });

    /*
     * Ростов 17.09.2026: лиды-организации привязаны к контактам, компании
     * нет. kind=company создаёт компанию и при живом контакте, а контакт
     * становится её сотрудником.
     */
    it('kind=company: лид с контактом получает компанию, контакт — в компанию', async () => {
        const portal = makePortal({
            leads: {
                42: { ...BARE_LEAD, TITLE: 'ООО «Юг»', CONTACT_ID: '77' },
            },
            companies: {},
        });
        const service = new LeadClientLinkService(portal.bitrix);

        const result = await service.link(100, DEAL, [42], {
            ...OPTIONS,
            kind: 'company',
        });

        expect(result.created).toEqual([
            { leadId: 42, type: 'company', id: 901, reused: false },
        ]);
        // Лид «повторный» — Битрикс телефоны не скопирует, дописали мы.
        expect(portal.companies[901].PHONE).toHaveLength(1);
        const link = portal.calls.find(
            c => c.method === 'crm.contact.company.add',
        );
        expect(link?.params).toEqual({ id: 77, fields: { COMPANY_ID: 901 } });
        expect(result.dealCompanySet).toBe(901);
        expect(portal.dealContacts).toEqual([77]);
    });

    it('без ФИО контакт называется по лиду', async () => {
        const portal = makePortal({
            leads: {
                42: { ID: '42', TITLE: 'Адвокатский кабинет Иванова' },
            },
        });
        await new LeadClientLinkService(portal.bitrix).link(
            100,
            DEAL,
            [42],
            OPTIONS,
        );

        expect(portal.contacts[901].NAME).toBe('Адвокатский кабинет Иванова');
    });

    it('дела лида привязываются к сделке и новому контакту один раз', async () => {
        const portal = makePortal({
            leads: { 42: { ...BARE_LEAD } },
            activities: { 42: [11, 12] },
        });
        const service = new LeadClientLinkService(portal.bitrix);

        const result = await service.link(100, DEAL, [42], OPTIONS);

        expect(result.activitiesBound).toBe(4);
        expect(portal.bindings.get(11)).toEqual(['2:100', '3:901']);

        // Привязки уже есть — повторных binding.add (400 в Битриксе) нет.
        portal.dealContacts.length = 0;
        const again = await service.link(100, DEAL, [42], OPTIONS);
        expect(again.activitiesBound).toBe(0);
    });

    it('сбой одного лида не мешает остальным', async () => {
        const portal = makePortal({
            leads: { 43: { ...BARE_LEAD, ID: '43' } },
        });
        const service = new LeadClientLinkService(portal.bitrix);

        const result = await service.link(100, DEAL, [42, 43], OPTIONS);

        expect(result.warnings[0]).toContain('Лид 42');
        expect(result.created).toHaveLength(1);
    });
});
