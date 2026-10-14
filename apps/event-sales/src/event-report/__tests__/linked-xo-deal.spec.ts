import { IBXDeal } from '@/modules/bitrix/domain/crm/deal/interface/bx-deal.interface';
import {
    dealsLinkedToBase,
    selectLinkedXoDeal,
} from '../services/init/linked-xo-deal';

const XO = '33';
const BASE = '31';
const LINK = 'UF_CRM_TO_BASE_SALES';

const deal = (over: Record<string, unknown> = {}): IBXDeal =>
    ({
        ID: '92283',
        CATEGORY_ID: XO,
        CLOSED: 'N',
        ASSIGNED_BY_ID: '445',
        ...over,
    }) as unknown as IBXDeal;

const select = (over: {
    activeDeals: IBXDeal[];
    baseDealId?: string | number | null;
    xoCategoryId?: string | null;
    own?: number[];
    fallback?: IBXDeal | null;
}) =>
    selectLinkedXoDeal({
        activeDeals: over.activeDeals,
        linkKey: LINK,
        xoCategoryId: over.xoCategoryId === undefined ? XO : over.xoCategoryId,
        baseDealId: over.baseDealId === undefined ? '92279' : over.baseDealId,
        ownResponsibleIds: new Set(over.own ?? [445]),
        fallback: over.fallback ?? null,
    });

/**
 * garant 14.10.2026: у компании открыты две ХО-сделки — старая #80903
 * (её основная давно закрыта) и текущая #92283 (основная #92279). Отчёт по
 * #92279 должен закрывать #92283, а не первую в списке.
 */
describe('selectLinkedXoDeal', () => {
    const stale = deal({ ID: '80903', [LINK]: '42643' });
    const current = deal({ ID: '92283', [LINK]: '92279' });

    it('берёт ХО-сделку, связанную с основной этой работы, а не первую', () => {
        expect(select({ activeDeals: [stale, current], fallback: stale })).toBe(
            current,
        );
    });

    it('ссылка с префиксом D_ и числом — тоже связь', () => {
        const prefixed = deal({ [LINK]: 'D_92279' });
        const numeric = deal({ ID: '1', [LINK]: 92279 });
        expect(select({ activeDeals: [prefixed] })).toBe(prefixed);
        expect(select({ activeDeals: [numeric] })).toBe(numeric);
    });

    it('связанных нет (старая ХО без ссылки) — прежний выбор', () => {
        const legacy = deal({ ID: '70000' });
        expect(select({ activeDeals: [legacy], fallback: legacy })).toBe(
            legacy,
        );
    });

    it('основной нет — прежний выбор, связи не ищем', () => {
        expect(
            select({
                activeDeals: [current],
                baseDealId: null,
                fallback: stale,
            }),
        ).toBe(stale);
    });

    it('воронка ХО не настроена — прежний выбор', () => {
        expect(
            select({
                activeDeals: [current],
                xoCategoryId: null,
                fallback: null,
            }),
        ).toBeNull();
    });

    it('сделка другой воронки со ссылкой на основную — не ХО', () => {
        const pres = deal({
            ID: '5',
            CATEGORY_ID: BASE,
            [LINK]: '92279',
        });
        expect(select({ activeDeals: [pres] })).toBeNull();
    });

    it('своя связанная предпочитается чужой, даже более свежей', () => {
        const own = deal({ ID: '100', [LINK]: '92279' });
        const foreign = deal({
            ID: '200',
            ASSIGNED_BY_ID: '999',
            [LINK]: '92279',
        });
        expect(select({ activeDeals: [foreign, own] })).toBe(own);
    });

    it('своих связанных нет — берём чужую связанную (она про эту работу)', () => {
        const foreign = deal({
            ASSIGNED_BY_ID: '999',
            [LINK]: '92279',
        });
        expect(select({ activeDeals: [foreign] })).toBe(foreign);
    });

    it('несколько своих связанных — самая свежая (больший ID)', () => {
        const older = deal({ ID: '90000', [LINK]: '92279' });
        expect(select({ activeDeals: [current, older] })).toBe(current);
        expect(select({ activeDeals: [older, current] })).toBe(current);
    });

    it('пустой набор «своих» (легаси-DTO) — фильтр выключен', () => {
        // Чужая и свежее своей: с фильтром взяли бы свою #92283.
        const foreign = deal({
            ID: '99999',
            ASSIGNED_BY_ID: '999',
            [LINK]: '92279',
        });
        expect(select({ activeDeals: [current, foreign], own: [] })).toBe(
            foreign,
        );
    });
});

describe('dealsLinkedToBase', () => {
    it('оставляет только сделки со ссылкой на эту основную', () => {
        const linked = deal({ ID: '1', [LINK]: '92279' });
        const other = deal({ ID: '2', [LINK]: '42643' });
        const empty = deal({ ID: '3' });
        expect(dealsLinkedToBase([linked, other, empty], LINK, 92279)).toEqual([
            linked,
        ]);
    });

    it('Битрикс проигнорировал фильтр (поля нет) — чужие сделки отсекаются', () => {
        const foreign = deal({ ID: '4', COMPANY_ID: '777' });
        expect(dealsLinkedToBase([foreign], LINK, '92279')).toEqual([]);
    });
});
