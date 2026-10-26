import { parseGarantFeed } from '../types/garant-feed.types';

describe('parseGarantFeed', () => {
    it('разбирает валидный фид по секциям', () => {
        const feed = parseGarantFeed({
            prices: {
                prof: [
                    {
                        number: 0,
                        complectName: 'Бухгалтер',
                        complectNumber: 0,
                        supplyNumber: 1,
                        price: 8187,
                        region: 0,
                        complectType: 0,
                    },
                ],
                universal: [],
                lt: [],
                star: [
                    {
                        number: 0,
                        name: 'СТАР',
                        fullName: 'Система торговых аналитических решений',
                        msk: 4600,
                        regions: 3800,
                        description: '',
                        type: 'star',
                        weight: 10,
                    },
                ],
            },
            regions: [
                {
                    number: 0,
                    title: 'Алтайский край',
                    abs: 4177.2,
                    name: 'ud',
                    infoblock: 'Законодательство Алтайского края',
                },
            ],
            consalting: [
                { id: 1, name: 'Советы экспертов', title: 'СЭ', rabs: 1 },
            ],
        });

        expect(feed.prices.prof).toHaveLength(1);
        expect(feed.prices.star[0].msk).toBe(4600);
        expect(feed.regions[0].name).toBe('ud');
        expect(feed.consalting[0].rabs).toBe(1);
    });

    it('невалидные строки и секции отбрасываются, а не роняют разбор', () => {
        const feed = parseGarantFeed({
            prices: {
                prof: [
                    { complectNumber: 'x', price: 1 },
                    null,
                    {
                        number: 1,
                        complectName: 'Юрист',
                        complectNumber: 2,
                        supplyNumber: false,
                        price: 100,
                        region: 'ud',
                        complectType: false,
                    },
                ],
                star: 'мусор',
            },
            regions: [{ name: '', title: 'Без кода', abs: 1 }],
        });

        expect(feed.prices.prof).toHaveLength(1);
        expect(feed.prices.star).toHaveLength(0);
        expect(feed.regions).toHaveLength(0);
        expect(feed.consalting).toHaveLength(0);
    });

    it('полностью чужой JSON даёт пустой фид', () => {
        const feed = parseGarantFeed('oops');
        expect(feed.prices.prof).toHaveLength(0);
        expect(feed.regions).toHaveLength(0);
    });
});
