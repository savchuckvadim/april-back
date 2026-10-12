import {
    INN_SYNC_KINDS,
    INN_SYNC_SOURCES,
    planInnSync,
} from '../inn-sync.plan';

const INN = '7707083893';
const OTHER = '7812032055';

const plan = (over: {
    dealInn?: string;
    companyInn?: string;
    hasCompany?: boolean;
    leadInns?: string[];
}) =>
    planInnSync({
        dealInn: over.dealInn ?? '',
        companyInn: over.companyInn ?? '',
        hasCompany: over.hasCompany ?? true,
        leadInns: over.leadInns ?? [],
    });

/**
 * Текущий ИНН — один в сделке и в компании (владелец, 06.10.2026), в каком
 * бы порядке они ни появлялись.
 */
describe('planInnSync', () => {
    it('совпадают или оба пусты без заявок — делать нечего', () => {
        expect(plan({ dealInn: INN, companyInn: INN }).kind).toBe(
            INN_SYNC_KINDS.none,
        );
        expect(plan({}).kind).toBe(INN_SYNC_KINDS.none);
    });

    it('компанию прицепили позже, у неё пусто — переносим из сделки', () => {
        expect(plan({ dealInn: INN })).toEqual({
            kind: INN_SYNC_KINDS.toCompany,
            inn: INN,
        });
    });

    it('в компании есть, в сделке пусто — переносим в сделку', () => {
        expect(plan({ companyInn: INN })).toEqual({
            kind: INN_SYNC_KINDS.toDeal,
            inn: INN,
            from: INN_SYNC_SOURCES.company,
        });
    });

    it('ИНН есть только в заявке — ставим его, если он один', () => {
        expect(plan({ leadInns: [INN, INN] })).toEqual({
            kind: INN_SYNC_KINDS.toDeal,
            inn: INN,
            from: INN_SYNC_SOURCES.lead,
        });
        expect(plan({ leadInns: [INN, OTHER] }).kind).toBe(INN_SYNC_KINDS.none);
    });

    it('в сделке и компании разные — сами не решаем, это выбор человека', () => {
        expect(plan({ dealInn: INN, companyInn: OTHER })).toEqual({
            kind: INN_SYNC_KINDS.mismatch,
            dealInn: INN,
            companyInn: OTHER,
        });
    });

    it('компании нет — переносить некуда; мусор вместо ИНН не считается', () => {
        expect(plan({ dealInn: INN, hasCompany: false }).kind).toBe(
            INN_SYNC_KINDS.none,
        );
        expect(plan({ companyInn: '1234567890' }).kind).toBe(
            INN_SYNC_KINDS.none,
        );
    });
});
