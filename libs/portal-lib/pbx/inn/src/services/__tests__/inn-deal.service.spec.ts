import { InnDealService } from '../inn-deal.service';
import { INN_ORIGINS } from '../../type/inn.type';

const INN = '7707083893';
const OTHER = '7812032055';

type Row = Record<string, unknown>;

interface ICall {
    method: string;
    params: Row;
}

const portal = {
    getEntityFieldByCode: (_entity: string, code: string) =>
        code === 'op_inn'
            ? { bitrixId: 'OP_INN' }
            : code === 'op_inn_pool'
              ? { bitrixId: 'OP_INN_POOL' }
              : undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
} as never;

interface IFixture {
    deal?: Row | null;
    requisites?: Row[];
    links?: Row[];
    comments?: Row[];
}

/**
 * Битрикс-заглушка: `api.call` для карточек и таймлайна, типизированные
 * сервисы реквизитов — как у настоящего `BitrixService`.
 */
function makeBitrix(fixture: IFixture = {}): {
    bitrix: never;
    calls: ICall[];
} {
    const calls: ICall[] = [];
    const rows: Record<string, unknown> = {
        // `deal: null` — сознательный случай «сделка не прочитана»,
        // поэтому дефолт подставляем только когда ключа нет вовсе.
        'crm.deal.get':
            'deal' in fixture ? fixture.deal : { ID: '100', COMPANY_ID: '55' },
        'crm.company.get': { ID: '55', TITLE: 'ООО «Ромашка»' },
        'crm.deal.contact.items.get': [],
        'crm.timeline.comment.list': fixture.comments ?? [],
    };
    const bitrix = {
        api: {
            call: (method: string, params: Row): Promise<unknown> => {
                calls.push({ method, params });
                return Promise.resolve({ result: rows[method] ?? [] });
            },
        },
        requisite: {
            getList: (): Promise<unknown> =>
                Promise.resolve({ result: fixture.requisites ?? [] }),
        },
        requisiteLink: {
            getList: (): Promise<unknown> =>
                Promise.resolve({ result: fixture.links ?? [] }),
        },
        requisitePreset: {
            getList: (): Promise<unknown> => Promise.resolve({ result: [] }),
        },
    };
    return { bitrix: bitrix as never, calls };
}

const service = (fixture: IFixture = {}) => {
    const { bitrix, calls } = makeBitrix(fixture);
    return {
        calls,
        service: new InnDealService(bitrix, portal, 'portal.bitrix24.ru'),
    };
};

const COMPANY_REQUISITE: Row = {
    ID: '812',
    ENTITY_TYPE_ID: '4',
    ENTITY_ID: '55',
    PRESET_ID: '1',
    NAME: 'Организация',
    RQ_INN: INN,
    RQ_KPP: '770701001',
    RQ_COMPANY_NAME: 'ООО «Ромашка»',
};

describe('InnDealService', () => {
    it('снимок собирает кандидатов из реквизитов и ничего не пишет', async () => {
        const fixture = service({ requisites: [COMPANY_REQUISITE] });

        const snapshot = await fixture.service.snapshot(100);

        expect(snapshot.candidates.map(item => item.inn)).toEqual([INN]);
        expect(snapshot.requisites[0].inn).toBe(INN);
        expect(snapshot.current).toBeNull();
        expect(
            fixture.calls.some(call => call.method === 'crm.deal.update'),
        ).toBe(false);
    });

    it('сделка не прочитана — доменная ошибка, а не пустой снимок', async () => {
        const fixture = service({ deal: null });

        await expect(fixture.service.snapshot(100)).rejects.toThrow(
            'не найдена',
        );
    });

    it('выбор пишется и возвращает уже обновлённый снимок', async () => {
        const fixture = service({ requisites: [COMPANY_REQUISITE] });
        const before = await fixture.service.snapshot(100);

        const after = await fixture.service.choose(100, {
            inn: INN,
            version: before.version,
            actor: { id: 12, name: 'Иванов Иван' },
        });

        expect(after.current?.inn).toBe(INN);
        expect(after.current?.origin).toBe(INN_ORIGINS.manual);
        expect(after.current?.userName).toBe('Иванов Иван');
        expect(after.version).not.toBe(before.version);
        // Второго чтения сделки ради ответа не делаем.
        expect(
            fixture.calls.filter(call => call.method === 'crm.deal.get'),
        ).toHaveLength(2);
    });

    /*
     * Гонка: пока карточка была открыта, робот или крон записали своё.
     * Молча перетирать чужую запись нельзя.
     */
    it('устаревшая версия снимка — отказ, запись не делается', async () => {
        const fixture = service({ requisites: [COMPANY_REQUISITE] });

        await expect(
            fixture.service.choose(100, {
                inn: INN,
                version: 'stale-version',
                actor: { id: 12, name: 'Иванов' },
            }),
        ).rejects.toThrow('изменились');
        expect(
            fixture.calls.some(call => call.method === 'crm.deal.update'),
        ).toBe(false);
    });

    it('закрытая сделка — только чтение', async () => {
        const fixture = service({
            deal: { ID: '100', COMPANY_ID: '55', CLOSED: 'Y' },
        });
        const snapshot = await fixture.service.snapshot(100);

        expect(snapshot.readOnly).toBe(true);
        await expect(
            fixture.service.choose(100, {
                inn: INN,
                version: snapshot.version,
                actor: { id: 12, name: 'Иванов' },
            }),
        ).rejects.toThrow('закрыта');
    });

    it('новое валидное значение добавляется в пул вместе с выбором', async () => {
        const fixture = service({ requisites: [COMPANY_REQUISITE] });
        const before = await fixture.service.snapshot(100);

        const after = await fixture.service.choose(100, {
            inn: OTHER,
            version: before.version,
            actor: { id: 12, name: 'Иванов' },
        });

        const candidate = after.candidates.find(item => item.inn === OTHER);
        expect(candidate?.isCurrent).toBe(true);
        expect(candidate?.inPool).toBe(true);
    });

    it('мусор вместо ИНН отклоняется до похода в Битрикс', async () => {
        const fixture = service();

        await expect(
            fixture.service.choose(100, {
                inn: '12345',
                version: 'any',
                actor: { id: 12, name: 'Иванов' },
            }),
        ).rejects.toThrow('не похоже на ИНН');
        expect(fixture.calls).toHaveLength(0);
    });

    it('скрытие варианта помечает его, из пула не удаляет', async () => {
        const fixture = service({
            deal: {
                ID: '100',
                COMPANY_ID: '55',
                UF_CRM_OP_INN_POOL: [INN, OTHER],
            },
        });

        const after = await fixture.service.hide(100, {
            inn: OTHER,
            actor: { id: 12, name: 'Иванов' },
        });

        const candidate = after.candidates.find(item => item.inn === OTHER);
        expect(candidate?.hidden).toBe(true);
        expect(candidate?.inPool).toBe(true);
    });

    it('текущий ИНН скрыть нельзя — сначала выбирают другой', async () => {
        const fixture = service({
            deal: { ID: '100', COMPANY_ID: '55', UF_CRM_OP_INN: INN },
        });

        await expect(
            fixture.service.hide(100, {
                inn: INN,
                actor: { id: 12, name: 'Иванов' },
            }),
        ).rejects.toThrow('сначала выберите другой');
    });
});
