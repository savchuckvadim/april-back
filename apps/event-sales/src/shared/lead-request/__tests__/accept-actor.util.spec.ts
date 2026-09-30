import { acceptActorIds, acceptActorOf } from '../accept-actor.util';

describe('acceptActorOf', () => {
    const deal = { ASSIGNED_BY_ID: '7' };
    const lead = { ASSIGNED_BY_ID: '5' };

    it('приоритет: явный userId → ответственный сделки → лида', () => {
        expect(acceptActorOf(9, deal, lead)).toBe(9);
        // Робот без userId: сделку двигает тот, кто работает.
        expect(acceptActorOf(undefined, deal, lead)).toBe(7);
        expect(acceptActorOf(undefined, null, lead)).toBe(5);
    });

    it('мусор вместо ответственного пропускается; некого — null', () => {
        expect(acceptActorOf(undefined, { ASSIGNED_BY_ID: '0' }, lead)).toBe(5);
        expect(acceptActorOf(undefined, { ASSIGNED_BY_ID: 'abc' }, lead)).toBe(
            5,
        );
        expect(acceptActorOf(undefined, {}, {})).toBeNull();
        expect(acceptActorOf(undefined, null, null)).toBeNull();
    });
});

describe('acceptActorIds', () => {
    it('все кандидаты: явные userId и ответственные строк', () => {
        expect(
            acceptActorIds(
                [9],
                [{ ASSIGNED_BY_ID: '7' }, { ASSIGNED_BY_ID: 5 }],
            ),
        ).toEqual([9, 7, 5]);
    });

    it('пустые и мусорные значения отсеиваются', () => {
        expect(
            acceptActorIds(
                [undefined, 0],
                [
                    null,
                    undefined,
                    {},
                    { ASSIGNED_BY_ID: '' },
                    { ASSIGNED_BY_ID: 'x' },
                ],
            ),
        ).toEqual([]);
    });
});
