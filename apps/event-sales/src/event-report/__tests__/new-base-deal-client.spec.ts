import {
    NewBaseDealClientSource,
    newBaseDealClientFields,
    parseDealContactItems,
} from '../services/deal/new-base-deal-client';

const BASE_CATEGORY = '31';

const source = (
    over: Partial<NewBaseDealClientSource> = {},
): NewBaseDealClientSource => ({
    company: null,
    lead: null,
    ownerDeal: null,
    ownerDealContactIds: [],
    planContact: null,
    reportContact: null,
    baseCategoryId: BASE_CATEGORY,
    ...over,
});

/** Закрытая сделка клиента без компании: два контакта, как у #28477. */
const CLOSED_DEAL = {
    ID: 28477,
    TITLE: 'Кацура Александра (3115015)',
    CATEGORY_ID: BASE_CATEGORY,
    COMPANY_ID: null,
    CONTACT_ID: 275105,
};

describe('newBaseDealClientFields', () => {
    it('garant 30.10.2026: сделка вместо закрытой получает её название и все контакты', () => {
        expect(
            newBaseDealClientFields(
                source({
                    ownerDeal: CLOSED_DEAL,
                    ownerDealContactIds: [275105, 282939],
                }),
            ),
        ).toEqual({
            TITLE: 'Кацура Александра (3115015)',
            CONTACT_ID: '275105',
            CONTACT_IDS: [275105, 282939],
        });
    });

    it('контакты не прочитались — остаётся главный контакт сделки', () => {
        const fields = newBaseDealClientFields(
            source({ ownerDeal: CLOSED_DEAL }),
        );
        expect(fields.CONTACT_ID).toBe('275105');
        expect(fields.CONTACT_IDS).toEqual([275105]);
    });

    it('компания из сделки запуска переезжает, когда якорь отчёта — сделка', () => {
        const fields = newBaseDealClientFields(
            source({ ownerDeal: { ...CLOSED_DEAL, COMPANY_ID: '77' } }),
        );
        expect(fields.COMPANY_ID).toBe('77');
    });

    describe('якорь — компания', () => {
        const company = { ID: 77, TITLE: 'ООО Ромашка' };

        it('название — компании; COMPANY_ID пишет ownerLinkFields, здесь его нет', () => {
            const fields = newBaseDealClientFields(source({ company }));
            expect(fields.TITLE).toBe('ООО Ромашка');
            expect(fields.COMPANY_ID).toBeUndefined();
        });

        it('сделка той же компании: контакты переезжают', () => {
            const fields = newBaseDealClientFields(
                source({
                    company,
                    ownerDeal: { ...CLOSED_DEAL, COMPANY_ID: '77' },
                    ownerDealContactIds: [275105],
                }),
            );
            expect(fields.CONTACT_IDS).toEqual([275105]);
        });

        it('сделка другой компании: её контакты и название не берём', () => {
            const fields = newBaseDealClientFields(
                source({
                    company: { ID: 77, TITLE: '4703142743' },
                    ownerDeal: { ...CLOSED_DEAL, COMPANY_ID: '78' },
                    ownerDealContactIds: [275105],
                }),
            );
            expect(fields.TITLE).toBeUndefined();
            expect(fields.CONTACT_IDS).toBeUndefined();
        });
    });

    describe('порядок названия', () => {
        it('заглушка сделки запуска пропускается — берём лид', () => {
            const fields = newBaseDealClientFields(
                source({
                    ownerDeal: { ...CLOSED_DEAL, TITLE: 'Сделка #110153' },
                    lead: { TITLE: 'Заявка Иванова' },
                }),
            );
            expect(fields.TITLE).toBe('Заявка Иванова');
        });

        it('название ХО-сделки и презентации клиентом не считается', () => {
            const fields = newBaseDealClientFields(
                source({
                    ownerDeal: {
                        ...CLOSED_DEAL,
                        CATEGORY_ID: '9',
                        TITLE: 'Презентация Иванов',
                    },
                    lead: { COMPANY_TITLE: 'ИП Иванов', TITLE: 'Заявка' },
                }),
            );
            expect(fields.TITLE).toBe('ИП Иванов');
        });

        it('без всего остального — имя контакта из отчёта', () => {
            const fields = newBaseDealClientFields(
                source({
                    planContact: {
                        ID: 5,
                        LAST_NAME: ' Иванов ',
                        NAME: 'Пётр',
                        SECOND_NAME: '',
                    },
                }),
            );
            expect(fields.TITLE).toBe('Иванов Пётр');
        });

        it('спецсимволы названия безопасны для batch', () => {
            const fields = newBaseDealClientFields(
                source({ company: { ID: 1, TITLE: 'A & B' } }),
            );
            expect(fields.TITLE).toBe('A %26 B');
        });
    });

    it('контакты: сначала сделка, потом лид и отчёт, без повторов и мусора', () => {
        const fields = newBaseDealClientFields(
            source({
                ownerDeal: CLOSED_DEAL,
                ownerDealContactIds: [275105],
                lead: { CONTACT_ID: '0' },
                planContact: { ID: 9 },
                reportContact: { ID: '275105' },
            }),
        );
        expect(fields.CONTACT_IDS).toEqual([275105, 9]);
    });

    it('клиента нет нигде — полей нет, название поставит Битрикс', () => {
        expect(newBaseDealClientFields(source())).toEqual({});
    });
});

describe('parseDealContactItems', () => {
    it('первичный контакт первым, порядок остальных сохраняется', () => {
        expect(
            parseDealContactItems([
                { CONTACT_ID: '282939', IS_PRIMARY: 'N' },
                { CONTACT_ID: '275105', IS_PRIMARY: 'Y' },
                { CONTACT_ID: 3 },
            ]),
        ).toEqual([275105, 282939, 3]);
    });

    it('нет ответа и мусор — пусто', () => {
        expect(parseDealContactItems(null)).toEqual([]);
        expect(parseDealContactItems([{ CONTACT_ID: 0 }])).toEqual([]);
    });
});
