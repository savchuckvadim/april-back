import {
    isRopMarkReason,
    isUncertainCallType,
    pickRopMarkCalls,
    ROP_MARK_REASONS,
    ROP_MARK_WEEK_LIMIT,
    ropMarkSeed,
    type RopMarkCandidate,
} from '../model/rop-mark';

const DOMAIN = 'a.bitrix24.ru';
const WEEK = '2026-W36';
const SEED = ropMarkSeed(DOMAIN, WEEK);

/** Кандидат недели; переопределяй только то, что важно кейсу. */
function candidate(
    overrides: Partial<RopMarkCandidate> & { transcriptionId: string },
): RopMarkCandidate {
    return {
        managerId: '10',
        callType: 'presentation',
        score: 50,
        ...overrides,
    };
}

/** По одному звонку на менеджера: типы и баллы разведены. */
function fiveManagers(): RopMarkCandidate[] {
    return [
        candidate({ transcriptionId: '101', managerId: '11', score: 40 }),
        candidate({
            transcriptionId: '102',
            managerId: '12',
            callType: 'other',
            score: 35,
        }),
        candidate({ transcriptionId: '103', managerId: '13', score: 92 }),
        candidate({ transcriptionId: '104', managerId: '14', score: 55 }),
        candidate({ transcriptionId: '105', managerId: '15', score: 60 }),
    ];
}

describe('pickRopMarkCalls — состав подбора недели', () => {
    it('ровно три звонка нужных видов: неуверенный тип, лучший балл, случайный', () => {
        const picks = pickRopMarkCalls(fiveManagers(), { seed: SEED });

        expect(picks).toHaveLength(ROP_MARK_WEEK_LIMIT);
        expect(picks.map(pick => pick.reason)).toEqual([...ROP_MARK_REASONS]);
        expect(picks[0].callType).toBe('other');
        // Лучший балл среди оставшихся после первого выбора.
        expect(picks[1].transcriptionId).toBe('103');
        expect(picks[1].score).toBe(92);
    });

    it('тип не определён — это тоже «неуверенный тип»', () => {
        const picks = pickRopMarkCalls(
            [
                candidate({ transcriptionId: '201', callType: null }),
                candidate({
                    transcriptionId: '202',
                    managerId: '20',
                    score: 80,
                }),
                candidate({
                    transcriptionId: '203',
                    managerId: '30',
                    score: 10,
                }),
            ],
            { seed: SEED },
        );

        expect(picks[0]).toMatchObject({
            transcriptionId: '201',
            reason: 'uncertain_type',
        });
        expect(isUncertainCallType(null)).toBe(true);
        expect(isUncertainCallType('irrelevant')).toBe(true);
        expect(isUncertainCallType('unknown-code')).toBe(true);
        expect(isUncertainCallType('presentation')).toBe(false);
    });

    it('повтор с тем же зерном даёт тот же набор, порядок входа не влияет', () => {
        const rows = fiveManagers();
        const first = pickRopMarkCalls(rows, { seed: SEED });
        const again = pickRopMarkCalls([...rows].reverse(), { seed: SEED });

        expect(again).toEqual(first);
        expect(
            pickRopMarkCalls(rows, { seed: ropMarkSeed(DOMAIN, WEEK) }),
        ).toEqual(first);
    });

    it('дубли по транскрипции не удваивают набор', () => {
        const rows = fiveManagers();
        const picks = pickRopMarkCalls([...rows, ...rows], { seed: SEED });

        expect(picks).toEqual(pickRopMarkCalls(rows, { seed: SEED }));
    });

    it('при пяти менеджерах — три разных менеджера', () => {
        const picks = pickRopMarkCalls(fiveManagers(), { seed: SEED });
        const managers = new Set(picks.map(pick => pick.managerId));

        expect(managers.size).toBe(ROP_MARK_WEEK_LIMIT);
    });

    it('кандидаты есть только у одного менеджера — берём его звонки, а не падаем', () => {
        const rows = [
            candidate({ transcriptionId: '301', callType: 'other' }),
            candidate({ transcriptionId: '302', score: 90 }),
            candidate({ transcriptionId: '303', score: 20 }),
        ];
        const picks = pickRopMarkCalls(rows, { seed: SEED });

        expect(picks).toHaveLength(ROP_MARK_WEEK_LIMIT);
        expect(new Set(picks.map(pick => pick.transcriptionId)).size).toBe(3);
        expect(new Set(picks.map(pick => pick.managerId))).toEqual(
            new Set(['10']),
        );
    });

    it('кандидатов меньше трёх — возвращается сколько есть, без падения', () => {
        const one = pickRopMarkCalls(
            [candidate({ transcriptionId: '401', score: null })],
            { seed: SEED },
        );

        expect(one).toHaveLength(1);
        expect(one[0].transcriptionId).toBe('401');
        expect(pickRopMarkCalls([], { seed: SEED })).toEqual([]);
    });

    it('строки без менеджера и без транскрипции в подбор не попадают', () => {
        const picks = pickRopMarkCalls(
            [
                candidate({ transcriptionId: '', managerId: '11' }),
                candidate({ transcriptionId: '501', managerId: '' }),
                candidate({ transcriptionId: '502', managerId: '12' }),
            ],
            { seed: SEED },
        );

        expect(picks.map(pick => pick.transcriptionId)).toEqual(['502']);
    });

    it('нет ни одного звонка с баллом — причина best_score пропускается', () => {
        const picks = pickRopMarkCalls(
            [
                candidate({
                    transcriptionId: '601',
                    callType: 'other',
                    score: null,
                }),
                candidate({
                    transcriptionId: '602',
                    managerId: '20',
                    score: null,
                }),
            ],
            { seed: SEED },
        );

        expect(picks.map(pick => pick.reason)).toEqual([
            'uncertain_type',
            'random',
        ]);
    });

    it('limit меняет размер набора: 1 — только неуверенный тип, 4 — добор случайным', () => {
        const rows = fiveManagers();

        expect(pickRopMarkCalls(rows, { seed: SEED, limit: 1 })).toHaveLength(
            1,
        );
        expect(
            pickRopMarkCalls(rows, { seed: SEED, limit: 4 }).map(
                pick => pick.reason,
            ),
        ).toEqual([...ROP_MARK_REASONS, 'random']);
        expect(pickRopMarkCalls(rows, { seed: SEED, limit: 0 })).toEqual([]);
    });

    it('зерно зависит от домена и недели, набор при другой неделе меняется', () => {
        expect(ropMarkSeed(DOMAIN, WEEK)).toBe(ropMarkSeed(DOMAIN, WEEK));
        expect(ropMarkSeed(DOMAIN, '2026-W37')).not.toBe(SEED);
        expect(ropMarkSeed('b.bitrix24.ru', WEEK)).not.toBe(SEED);
    });

    it('isRopMarkReason — сторож словаря причин', () => {
        expect(isRopMarkReason('best_score')).toBe(true);
        expect(isRopMarkReason('worst_score')).toBe(false);
        expect(isRopMarkReason(3)).toBe(false);
    });
});
