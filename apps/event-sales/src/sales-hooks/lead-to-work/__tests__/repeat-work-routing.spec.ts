import {
    IRepeatDealInfo,
    IRepeatResolution,
} from '../lib/repeat-work.resolver';
import {
    activeRepeatOwner,
    isJoinable,
    routeRepeatOutcomes,
} from '../lib/repeat-work-routing';

const deal = (
    dealId: number,
    responsibleId: number | null,
): IRepeatDealInfo => ({
    dealId,
    closed: false,
    stageId: 'C31:WARM',
    responsibleId,
    companyId: null,
    title: `Сделка ${dealId}`,
    modifiedAt: null,
    row: { ID: String(dealId) },
});

const join = (dealId: number, ownerId: number | null): IRepeatResolution => ({
    kind: 'join',
    signal: 'order',
    value: '3260882',
    mainDeal: deal(dealId, ownerId),
});

/** Несколько открытых: самая свежая уже выбрана резолвером. */
const ambiguous = (
    mainId: number,
    ownerId: number,
    otherId: number,
): IRepeatResolution => ({
    kind: 'ambiguous',
    signal: 'inn',
    value: '4826006839',
    mainDeal: deal(mainId, ownerId),
    openDeals: [deal(mainId, ownerId), deal(otherId, 455)],
});

const outcomes = (
    entries: [number, IRepeatResolution][],
): Map<number, { resolution: IRepeatResolution }> =>
    new Map(entries.map(([leadId, resolution]) => [leadId, { resolution }]));

describe('routeRepeatOutcomes', () => {
    const batch = outcomes([
        [1, join(100, 387)],
        [2, ambiguous(200, 433, 201)],
        [3, { kind: 'reuse-client', companyId: 91429 }],
        [4, { kind: 'none' }],
    ]);

    it('режим «присоединять»: одна открытая и самая свежая из нескольких — одинаково в присоединения', () => {
        const routing = routeRepeatOutcomes(batch, 'on');

        expect([...routing.joins.keys()]).toEqual([1, 2]);
        expect(routing.joins.get(2)?.resolution.mainDeal?.dealId).toBe(200);
        expect(routing.notes).toEqual([]);
        // Владельцы выбранных сделок — на проверку «работает ли».
        expect(routing.ownerIds).toEqual([387, 433]);
    });

    it('холостой ход: ни одного присоединения, только комментарии в лиды', () => {
        const routing = routeRepeatOutcomes(batch, 'dry_run');

        expect(routing.joins.size).toBe(0);
        expect(routing.ownerIds).toEqual([]);
        expect(
            routing.notes.map(note => [note.leadId, note.resolution.kind]),
        ).toEqual([
            [1, 'join'],
            [2, 'ambiguous'],
        ]);
        expect(routing.notes.every(note => note.mode === 'dry_run')).toBe(true);
    });

    it('выключено: ничего', () => {
        const routing = routeRepeatOutcomes(batch, 'off');
        expect(routing.joins.size).toBe(0);
        expect(routing.notes).toEqual([]);
    });

    it('сделка без ответственного присоединяется, но в проверку владельцев не попадает', () => {
        const routing = routeRepeatOutcomes(
            outcomes([[7, join(700, null)]]),
            'on',
        );
        expect(routing.joins.has(7)).toBe(true);
        expect(routing.ownerIds).toEqual([]);
    });

    it('неоднозначность без выбранной сделки (старый формат) не присоединяется', () => {
        expect(isJoinable({ kind: 'ambiguous', openDeals: [deal(1, 2)] })).toBe(
            false,
        );
    });
});

describe('activeRepeatOwner', () => {
    it('владелец выбранной сделки работает — он и ответственный', () => {
        expect(
            activeRepeatOwner(
                { resolution: ambiguous(200, 433, 201) },
                new Set([433]),
            ),
        ).toBe(433);
    });

    it('владелец не работает — null: круг, затем передача сделки', () => {
        expect(
            activeRepeatOwner({ resolution: join(100, 387) }, new Set([455])),
        ).toBeNull();
    });

    it('присоединения нет — null', () => {
        expect(activeRepeatOwner(undefined, new Set([387]))).toBeNull();
    });
});
