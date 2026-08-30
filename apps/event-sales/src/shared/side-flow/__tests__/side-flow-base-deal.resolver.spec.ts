import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { SideFlowBaseDealResolver } from '../side-flow-base-deal.resolver';
import { FlowBitrix } from '../side-flow.types';

/**
 * Дотяжка базовой сделки по компании: сделку мог создать ЭТОТ ЖЕ отчёт,
 * и на момент постановки джоба числового id не было.
 *
 * Правило владельца (25.08): дотяжка берёт ТОЛЬКО сделки ответственного
 * отчёта — иначе элемент уехал бы в сделку другого менеджера. Ничего не
 * нашлось (или Битрикс отказал) — честная деградация в null: элемент
 * останется связан компанией/лидом, джоб не падает.
 */
const DOMAIN = 'x.bitrix24.ru';
const COMPANY_ID = 431;
const RESPONSIBLE_ID = 8;

const makeHarness = (over?: {
    /** Строки crm.deal.list — REST отдаёт id строками. */
    rows?: Array<{ ID: string; ASSIGNED_BY_ID?: string }>;
    /** Категории sales_base на портале нет. */
    noCategory?: boolean;
    /** Битрикс отказал на выборке. */
    listFails?: boolean;
}) => {
    const filters: Array<Record<string, unknown>> = [];

    const bitrix = {
        deal: {
            getList: (filter: Record<string, unknown>) => {
                filters.push(filter);
                if (over?.listFails) {
                    return Promise.reject(new Error('битрикс недоступен'));
                }
                return Promise.resolve({ result: over?.rows ?? [] });
            },
        },
    } as unknown as FlowBitrix;

    const portal = {
        getDealCategoryByCode: () =>
            over?.noCategory ? undefined : { bitrixId: 5, stages: [] },
    } as unknown as PortalModel;

    const resolver = new SideFlowBaseDealResolver();
    const log = jest
        .spyOn(resolver['logger'], 'log')
        .mockImplementation(() => undefined);
    const warn = jest
        .spyOn(resolver['logger'], 'warn')
        .mockImplementation(() => undefined);

    return { resolver, bitrix, portal, filters, log, warn };
};

describe('SideFlowBaseDealResolver', () => {
    it('без компании искать не по чему — null без обращения к Битриксу', async () => {
        const { resolver, bitrix, portal, filters } = makeHarness();

        const id = await resolver.resolve(bitrix, portal, {
            domain: DOMAIN,
            companyId: null,
            responsibleId: RESPONSIBLE_ID,
        });

        expect(id).toBeNull();
        expect(filters).toHaveLength(0);
    });

    it('категории sales_base на портале нет — null без обращения к Битриксу', async () => {
        const { resolver, bitrix, portal, filters } = makeHarness({
            noCategory: true,
        });

        const id = await resolver.resolve(bitrix, portal, {
            domain: DOMAIN,
            companyId: COMPANY_ID,
            responsibleId: RESPONSIBLE_ID,
        });

        expect(id).toBeNull();
        expect(filters).toHaveLength(0);
    });

    it('ищет только открытые сделки основной воронки этой компании', async () => {
        const { resolver, bitrix, portal, filters } = makeHarness({
            rows: [{ ID: '100', ASSIGNED_BY_ID: '8' }],
        });

        await resolver.resolve(bitrix, portal, {
            domain: DOMAIN,
            companyId: COMPANY_ID,
            responsibleId: RESPONSIBLE_ID,
        });

        expect(filters[0]).toEqual({
            CATEGORY_ID: '5',
            COMPANY_ID: '431',
            CLOSED: 'N',
        });
    });

    // id монотонен: из своих открытых берём самую свежую.
    it('из нескольких своих сделок берёт самую свежую (максимальный id)', async () => {
        const { resolver, bitrix, portal } = makeHarness({
            rows: [
                { ID: '100', ASSIGNED_BY_ID: '8' },
                { ID: '340', ASSIGNED_BY_ID: '8' },
                { ID: '221', ASSIGNED_BY_ID: '8' },
            ],
        });

        const id = await resolver.resolve(bitrix, portal, {
            domain: DOMAIN,
            companyId: COMPANY_ID,
            responsibleId: RESPONSIBLE_ID,
        });

        expect(id).toBe(340);
    });

    /*
     * Правило владельца 25.08: чужая открытая сделка не подхватывается,
     * даже если она свежее своей — элемент ушёл бы другому менеджеру.
     * ASSIGNED_BY_ID сравнивается ЧИСЛОМ: REST отдаёт строки.
     */
    it('чужие открытые сделки не подхватываются, даже если они свежее', async () => {
        const { resolver, bitrix, portal } = makeHarness({
            rows: [
                { ID: '100', ASSIGNED_BY_ID: '8' },
                { ID: '900', ASSIGNED_BY_ID: '15' },
            ],
        });

        const id = await resolver.resolve(bitrix, portal, {
            domain: DOMAIN,
            companyId: COMPANY_ID,
            responsibleId: RESPONSIBLE_ID,
        });

        expect(id).toBe(100);
    });

    it('своих сделок нет — честная деградация в null', async () => {
        const { resolver, bitrix, portal } = makeHarness({
            rows: [{ ID: '900', ASSIGNED_BY_ID: '15' }],
        });

        const id = await resolver.resolve(bitrix, portal, {
            domain: DOMAIN,
            companyId: COMPANY_ID,
            responsibleId: RESPONSIBLE_ID,
        });

        expect(id).toBeNull();
    });

    // Легаси-джоб без ответственного: некого считать «своим».
    it('пустой responsibleId выключает фильтр «своих»', async () => {
        const { resolver, bitrix, portal } = makeHarness({
            rows: [{ ID: '900', ASSIGNED_BY_ID: '15' }],
        });

        const id = await resolver.resolve(bitrix, portal, {
            domain: DOMAIN,
            companyId: COMPANY_ID,
        });

        expect(id).toBe(900);
    });

    it('Битрикс отказал — null и warn, джоб не падает', async () => {
        const { resolver, bitrix, portal, warn } = makeHarness({
            listFails: true,
        });

        const id = await resolver.resolve(bitrix, portal, {
            domain: DOMAIN,
            companyId: COMPANY_ID,
            responsibleId: RESPONSIBLE_ID,
        });

        expect(id).toBeNull();
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('битрикс недоступен'),
        );
    });

    /*
     * Сервис общий на две очереди: без имени потока по строке «дотяжка не
     * удалась» уже не понять, чей отчёт остался без базовой сделки —
     * поэтому поток обязан доезжать до префикса и на успехе, и на отказе.
     */
    it('пишет в лог имя потока, который дотягивал сделку', async () => {
        const { resolver, bitrix, portal, log } = makeHarness({
            rows: [{ ID: '100', ASSIGNED_BY_ID: '8' }],
        });

        await resolver.resolve(bitrix, portal, {
            flow: 'pres-flow',
            domain: DOMAIN,
            companyId: COMPANY_ID,
            responsibleId: RESPONSIBLE_ID,
        });

        expect(log).toHaveBeenCalledWith(
            expect.stringContaining('[pres-flow] '),
        );
    });

    it('пишет имя потока и в предупреждении о несостоявшейся дотяжке', async () => {
        const { resolver, bitrix, portal, warn } = makeHarness({
            listFails: true,
        });

        await resolver.resolve(bitrix, portal, {
            flow: 'zpr-flow',
            domain: DOMAIN,
            companyId: COMPANY_ID,
            responsibleId: RESPONSIBLE_ID,
        });

        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('[zpr-flow] дотяжка сделки'),
        );
    });

    // Легаси-вызов без имени потока: остаётся общий префикс раздела.
    it('без имени потока остаётся общий префикс [side-flow]', async () => {
        const { resolver, bitrix, portal, log } = makeHarness({
            rows: [{ ID: '100', ASSIGNED_BY_ID: '8' }],
        });

        await resolver.resolve(bitrix, portal, {
            domain: DOMAIN,
            companyId: COMPANY_ID,
            responsibleId: RESPONSIBLE_ID,
        });

        expect(log).toHaveBeenCalledWith(
            expect.stringContaining('[side-flow] '),
        );
    });
});
