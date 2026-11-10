import {
    incompletePartsOf,
    REPAIR_LEGACY_SINCE,
    selectRepairCandidates,
    type RepairRecordView,
} from '../use-cases/call-analysis-repair.util';

/**
 * Отбор неполных разборов для догона (требование владельца 10.11.2026:
 * «если упало, потом должно восстановиться»).
 */
const AFTER = new Date(REPAIR_LEGACY_SINCE.getTime() + 19 * 60 * 60 * 1000);
const BEFORE = new Date(REPAIR_LEGACY_SINCE.getTime() - 60 * 60 * 1000);

const FULL_SECTIONS = [
    { section: 'GREETING' },
    { section: 'NEEDS' },
    { section: 'CLOSING' },
];

const record = (
    over: Partial<RepairRecordView> & { user_result?: unknown } = {},
): RepairRecordView => ({
    id: 'ai-1',
    type: 'agent-analysis',
    status: 'done',
    transcription_id: 't-1',
    createdAt: AFTER,
    user_result: { score: 72, sections: FULL_SECTIONS },
    ...over,
});

describe('incompletePartsOf', () => {
    it('пометка в разборе — как есть; незнакомые коды отбрасываются', () => {
        expect(
            incompletePartsOf(
                record({
                    user_result: {
                        incompleteParts: ['movement', 'synthesis', 'whatever'],
                        sections: [],
                    },
                }),
            ),
        ).toEqual(['movement', 'synthesis']);
    });

    it('пустая пометка — разбор полный, даже если зона без разделов', () => {
        expect(
            incompletePartsOf(
                record({ user_result: { incompleteParts: [], sections: [] } }),
            ),
        ).toEqual([]);
    });

    it('без пометки, свежая запись: нет оценки — синтез; нет зоны — её проход', () => {
        expect(
            incompletePartsOf(
                record({
                    user_result: {
                        sections: [
                            { section: 'GREETING' },
                            { section: 'NEEDS' },
                        ],
                    },
                }),
            ),
        ).toEqual(['movement', 'synthesis']);
    });

    it('без пометки, полная свежая запись — не трогаем', () => {
        expect(incompletePartsOf(record())).toEqual([]);
    });

    it('без пометки, запись до 10.11.2026 — не проверяем по содержимому', () => {
        expect(
            incompletePartsOf(
                record({ createdAt: BEFORE, user_result: { sections: [] } }),
            ),
        ).toEqual([]);
    });

    it('нет разбора в записи — нечего догонять', () => {
        expect(incompletePartsOf(record({ user_result: null }))).toEqual([]);
    });
});

describe('selectRepairCandidates', () => {
    it('только активные неполные, свежие первыми; замещённые не берём', () => {
        const older = record({
            id: 'ai-old',
            transcription_id: 't-a',
            createdAt: new Date(AFTER.getTime() - 60_000),
            user_result: { incompleteParts: ['form'] },
        });
        const newer = record({
            id: 'ai-new',
            transcription_id: 't-b',
            user_result: { incompleteParts: ['synthesis'] },
        });
        const superseded = record({
            id: 'ai-sup',
            transcription_id: 't-c',
            status: 'superseded',
            user_result: { incompleteParts: ['form'] },
        });
        const complete = record({ id: 'ai-ok', transcription_id: 't-d' });

        const picked = selectRepairCandidates([
            older,
            superseded,
            complete,
            newer,
        ]);

        expect(picked.map(c => c.record.id)).toEqual(['ai-new', 'ai-old']);
        expect(picked[0]).toMatchObject({
            transcriptionId: 't-b',
            parts: ['synthesis'],
        });
    });
});
