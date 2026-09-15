import { emptyStyle, mapLiteStyle } from '../lib/analytics-lite-style.mapper';

describe('mapLiteStyle', () => {
    it('проецирует маркеры стиля из user_result разбора', () => {
        expect(
            mapLiteStyle({
                talkRatioPct: 58,
                questionsCount: 12,
                needsFound: true,
                needs: ['срок', 'цена'],
                presentationDone: false,
                productsOffered: [],
                priceDiscussed: true,
                competitors: ['consultant'],
                refusalCategory: 'market',
                interlocutorRole: 'decision_maker',
                productive: true,
                scriptCompliance: 80,
            }),
        ).toEqual({
            talkRatioPct: 58,
            questionsCount: 12,
            needsFound: true,
            needsCount: 2,
            presentationDone: false,
            productsOfferedCount: 0,
            priceDiscussed: true,
            competitorsCount: 1,
            refusalCategory: 'market',
            interlocutorRole: 'decision_maker',
            productive: true,
            scriptCompliance: 80,
            callDirection: null,
        });
    });

    it('разбора нет — все маркеры null', () => {
        expect(mapLiteStyle(null)).toEqual(emptyStyle());
    });

    it('чужие типы значений в маркеры не попадают', () => {
        const style = mapLiteStyle({
            talkRatioPct: '58',
            needsFound: 'yes',
            needs: 'срок',
            priceDiscussed: null,
            interlocutorRole: '',
        });

        expect(style.talkRatioPct).toBeNull();
        expect(style.needsFound).toBeNull();
        expect(style.needsCount).toBeNull();
        expect(style.priceDiscussed).toBeNull();
        expect(style.interlocutorRole).toBeNull();
    });

    it('пустые экземпляры не разделяются между строками', () => {
        const first = emptyStyle();
        const second = emptyStyle();
        first.talkRatioPct = 10;

        expect(second.talkRatioPct).toBeNull();
    });
});
