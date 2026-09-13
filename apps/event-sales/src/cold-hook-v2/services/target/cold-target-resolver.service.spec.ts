import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    EnumColdCallEntityType,
    EnumColdCallForce,
    EnumColdCallIsTmc,
} from '../../dto/cold.dto';
import { IColdCallData } from '../../type/cold-hook-silence.interface';
import {
    ColdTargetResolverV2Service,
    toLinkedDealId,
} from './cold-target-resolver.service';

/**
 * Цель холодного старта (шаг 2 плана v2): вход-компания — корень компания;
 * вход-сделка с компанией — корень компания, сделка сохраняется как входная;
 * вход-сделка без компании — корень сделка, `rootDealId` — её основная.
 */
const BASE_CATEGORY_ID = '17';
const PRES_CATEGORY_ID = '48';

type Row = Record<string, unknown>;

const DEALS: Record<number, Row> = {
    500: { ID: '500', CATEGORY_ID: BASE_CATEGORY_ID, COMPANY_ID: '7' },
    600: { ID: '600', CATEGORY_ID: BASE_CATEGORY_ID, COMPANY_ID: '0' },
    700: {
        ID: '700',
        CATEGORY_ID: PRES_CATEGORY_ID,
        COMPANY_ID: '',
        UF_CRM_TO_BASE_SALES: 'D_77',
    },
    800: { ID: '800', CATEGORY_ID: PRES_CATEGORY_ID, COMPANY_ID: '' },
    900: { ID: '900', CATEGORY_ID: PRES_CATEGORY_ID, COMPANY_ID: '404' },
    650: {
        ID: '650',
        CATEGORY_ID: BASE_CATEGORY_ID,
        COMPANY_ID: '',
        UF_CRM_TO_BASE_SALES: 'D_77',
    },
};
const COMPANIES: Record<number, Row> = {
    7: { ID: '7', TITLE: 'ООО Ромашка' },
    9: { ID: '9', TITLE: 'ООО Лютик' },
};

const makePortal = (toBaseSalesInstalled = true) =>
    ({
        getEntityFieldByCode: (_entity: string, code: string) =>
            toBaseSalesInstalled && code === 'to_base_sales'
                ? { bitrixId: 'TO_BASE_SALES' }
                : undefined,
        getDealCategoryByCode: (code: string) =>
            code === 'sales_base'
                ? { bitrixId: BASE_CATEGORY_ID, code, stages: [] }
                : undefined,
        getDealCategories: () => [],
    }) as unknown as PortalModel;

/** Фейк bitrix: get кладёт команду, callBatch отдаёт чанк по накопленным. */
const makeBitrix = () => {
    const pending: Array<[string, unknown]> = [];
    const getDeal = jest.fn((key: string, id: number) => {
        pending.push([key, DEALS[id] ?? null]);
    });
    const getCompany = jest.fn((key: string, id: number) => {
        pending.push([key, COMPANIES[id] ?? null]);
    });
    const callBatchWithConcurrency = jest.fn(async () => {
        const result: Record<string, unknown> = {};
        for (const [key, row] of pending) {
            if (row) result[key] = row;
        }
        pending.length = 0;
        return [{ result }];
    });
    return {
        api: { domain: 'd.b24.ru', callBatchWithConcurrency },
        batch: { deal: { get: getDeal }, company: { get: getCompany } },
        __getDeal: getDeal,
        __getCompany: getCompany,
        __callBatch: callBatchWithConcurrency,
    };
};

const hook = (
    entityType: EnumColdCallEntityType,
    entityId: string,
): IColdCallData => ({
    entityType,
    entityId,
    responsible: 'user_447',
    created: 'user_1',
    deadline: '05.09.2026 11:00:00',
    name: 'ХО',
    isTmc: EnumColdCallIsTmc.N,
    force: EnumColdCallForce.N,
});

const resolve = (
    hooks: Record<string, IColdCallData>,
    portal = makePortal(),
    bitrix = makeBitrix(),
) =>
    new ColdTargetResolverV2Service(
        portal,
        bitrix as unknown as BitrixService,
    ).resolve(hooks);

describe('ColdTargetResolverV2Service', () => {
    it('вход-компания: корень компания, входной сделки нет', async () => {
        const [target] = await resolve({
            h1: hook(EnumColdCallEntityType.COMPANY, '7'),
        });
        expect(target).toMatchObject({
            hookKey: 'h1',
            kind: 'company',
            companyId: 7,
            entryDeal: null,
            rootDealId: null,
        });
        expect(target.company?.TITLE).toBe('ООО Ромашка');
    });

    it('сделка с компанией: корень компания, сделка сохраняется как входная', async () => {
        const [target] = await resolve({
            h1: hook(EnumColdCallEntityType.DEAL, '500'),
        });
        expect(target).toMatchObject({
            kind: 'company',
            companyId: 7,
            rootDealId: 500,
        });
        expect(target.entryDeal?.ID).toBe('500');
        expect(target.company?.ID).toBe('7');
    });

    it('сделка без компании в sales_base: корень сделка, root — она сама', async () => {
        const [target] = await resolve({
            h1: hook(EnumColdCallEntityType.DEAL, '600'),
        });
        expect(target).toMatchObject({
            kind: 'deal',
            company: null,
            companyId: null,
            rootDealId: 600,
        });
    });

    it('сделка без компании со ссылкой to_base_sales: root — по ссылке', async () => {
        const [target] = await resolve({
            h1: hook(EnumColdCallEntityType.DEAL, '700'),
        });
        expect(target).toMatchObject({ kind: 'deal', rootDealId: 77 });
    });

    it('основная со случайной ссылкой to_base_sales — корень она сама, не ссылка', async () => {
        const [target] = await resolve({
            h1: hook(EnumColdCallEntityType.DEAL, '650'),
        });
        expect(target.rootDealId).toBe(650);
    });

    it('сделка без компании, не основная и без ссылки: root — null', async () => {
        const [target] = await resolve({
            h1: hook(EnumColdCallEntityType.DEAL, '800'),
        });
        expect(target).toMatchObject({ kind: 'deal', rootDealId: null });
    });

    it('COMPANY_ID стоит, а компании нет — корень сделка', async () => {
        const [target] = await resolve({
            h1: hook(EnumColdCallEntityType.DEAL, '900'),
        });
        expect(target).toMatchObject({
            kind: 'deal',
            company: null,
            companyId: null,
        });
    });

    it('поле to_base_sales не в слепке — читается по канону install', async () => {
        const [target] = await resolve(
            { h1: hook(EnumColdCallEntityType.DEAL, '700') },
            makePortal(false),
        );
        expect(target.rootDealId).toBe(77);
    });

    /*
     * Окно тишины собирает все хуки подряд, и по одному клиенту их легко
     * бывает несколько: робот сработал дважды, кнопку нажали повторно, БП
     * перезапустили на списке. Без схлопывания каждый дубль проходит весь
     * путь заново — вторая холодная сделка, вторая задача, вторая запись в
     * истории (сделка 25431, 13.09.2026).
     */
    describe('дубли в одном окне схлопываются', () => {
        it('два хука по одной сделке → одна цель', async () => {
            const targets = await resolve({
                h1: hook(EnumColdCallEntityType.DEAL, '500'),
                h2: hook(EnumColdCallEntityType.DEAL, '500'),
            });

            expect(targets).toHaveLength(1);
        });

        it('два хука по одной компании → одна цель', async () => {
            const targets = await resolve({
                h1: hook(EnumColdCallEntityType.COMPANY, '7'),
                h2: hook(EnumColdCallEntityType.COMPANY, '7'),
            });

            expect(targets).toHaveLength(1);
        });

        it('побеждает ПОСЛЕДНИЙ хук — робот мог дописать поля между вызовами', async () => {
            const targets = await resolve({
                h1: {
                    ...hook(EnumColdCallEntityType.DEAL, '500'),
                    name: 'первый',
                },
                h2: {
                    ...hook(EnumColdCallEntityType.DEAL, '500'),
                    name: 'второй',
                },
            });

            expect(targets).toHaveLength(1);
            expect(targets[0].hook.name).toBe('второй');
        });

        it('разные сущности не схлопываются', async () => {
            const targets = await resolve({
                h1: hook(EnumColdCallEntityType.DEAL, '500'),
                h2: hook(EnumColdCallEntityType.COMPANY, '7'),
            });

            expect(targets).toHaveLength(2);
        });
    });

    it('контакт и лид пропускаются, сделка/компания не найдены — тоже', async () => {
        const targets = await resolve({
            h1: hook(EnumColdCallEntityType.CONTACT, '1'),
            h2: hook(EnumColdCallEntityType.LEAD, '2'),
            h3: hook(EnumColdCallEntityType.DEAL, '999'),
            h4: hook(EnumColdCallEntityType.COMPANY, '999'),
        });
        expect(targets).toEqual([]);
    });

    it('чтение — один батч сделок и один компаний, без дублей по id', async () => {
        const bitrix = makeBitrix();
        const targets = await resolve(
            {
                h1: hook(EnumColdCallEntityType.COMPANY, '7'),
                h2: hook(EnumColdCallEntityType.DEAL, '500'),
                h3: hook(EnumColdCallEntityType.COMPANY, '9'),
            },
            makePortal(),
            bitrix,
        );
        expect(targets.map(t => t.hookKey)).toEqual(['h1', 'h2', 'h3']);
        // Компания 7 нужна и хуку h1, и сделке 500 — читается один раз.
        expect(bitrix.__getCompany.mock.calls.map(c => c[1])).toEqual([7, 9]);
        expect(bitrix.__getDeal.mock.calls.map(c => c[1])).toEqual([500]);
        expect(bitrix.__callBatch).toHaveBeenCalledTimes(2);
    });

    it('без хуков — без обращений к Bitrix', async () => {
        const bitrix = makeBitrix();
        expect(await resolve({}, makePortal(), bitrix)).toEqual([]);
        expect(bitrix.__callBatch).not.toHaveBeenCalled();
    });
});

describe('toLinkedDealId', () => {
    it.each([
        ['D_77', 77],
        ['77', 77],
        [77, 77],
        [['D_5'], 5],
        ['', null],
        ['0', null],
        ['мусор', null],
        [null, null],
        [undefined, null],
    ])('%p → %p', (raw, expected) => {
        expect(toLinkedDealId(raw)).toBe(expected);
    });
});
