import { CALL_REPORT_PROMPT_VERSION } from '../contracts/call-report-versions.const';
import {
    estimateReanalysisCostWithMethodology,
    isMethodologyStale,
    recordCallType,
    recordMethodologyTag,
    type ReanalysisMethodology,
} from '../use-cases/call-report-reanalyze.methodology';
import { selectReanalysisCandidates } from '../use-cases/call-report-reanalyze.util';

/** Методика применима к показам и звонкам после показа, к холодным — нет. */
const METHODOLOGY: ReanalysisMethodology = {
    tag: 'polyansky@1.2',
    appliesTo: callType =>
        callType === 'presentation' || callType === 'decision',
};

const analysis = (fields: {
    callType?: string;
    prompt?: string;
    methodology?: string;
}) => ({
    callType: fields.callType ?? 'presentation',
    weightedScore: 70,
    versions: {
        prompt: fields.prompt ?? CALL_REPORT_PROMPT_VERSION,
        ...(fields.methodology ? { methodology: fields.methodology } : {}),
    },
});

const row = (id: string) => ({
    id,
    userId: '317',
    callStartedAt: new Date('2026-09-10T10:00:00Z'),
    createdAt: new Date('2026-09-10T10:30:00Z'),
});

const record = (id: string, userResult: unknown) => ({
    id: `r${id}`,
    type: 'agent-analysis',
    status: 'done',
    transcription_id: id,
    user_result: userResult,
});

describe('переразбор и методика портала', () => {
    it('метка методики и тип звонка читаются из разбора; чужая форма — null', () => {
        const done = analysis({ methodology: 'polyansky@1.2' });
        expect(recordMethodologyTag(done)).toBe('polyansky@1.2');
        expect(recordCallType(done)).toBe('presentation');
        expect(recordMethodologyTag(analysis({}))).toBeNull();
        expect(recordMethodologyTag('мусор')).toBeNull();
        expect(recordCallType(null)).toBeNull();
    });

    it('разбор без прохода методики устарел, только если методика выбрана и применима к типу звонка', () => {
        expect(isMethodologyStale(analysis({}), METHODOLOGY)).toBe(true);
        expect(
            isMethodologyStale(
                analysis({ methodology: 'polyansky@1.1' }),
                METHODOLOGY,
            ),
        ).toBe(true);
        expect(
            isMethodologyStale(
                analysis({ methodology: 'polyansky@1.2' }),
                METHODOLOGY,
            ),
        ).toBe(false);
        // Холодный звонок вне методики: разбор без неё — полный.
        expect(
            isMethodologyStale(analysis({ callType: 'cold' }), METHODOLOGY),
        ).toBe(false);
        expect(isMethodologyStale(analysis({}), null)).toBe(false);
    });

    it('отбор: разбор текущей версии без методики — кандидат; с методикой и вне методики — пропуск', () => {
        const selection = selectReanalysisCandidates({
            transcriptions: ['1', '2', '3', '4'].map(row),
            records: [
                record('1', analysis({})),
                record('2', analysis({ methodology: 'polyansky@1.2' })),
                record('3', analysis({ callType: 'cold' })),
                record('4', analysis({ prompt: 'focus-v2.2-2026-09-08' })),
            ],
            currentPromptVersion: CALL_REPORT_PROMPT_VERSION,
            roster: null,
            methodology: METHODOLOGY,
        });

        expect(selection.candidates.map(item => item.transcriptionId)).toEqual([
            '1',
            '4',
        ]);
        expect(selection.methodologyOnly).toBe(1);
        expect(selection.skippedBy.upToDate).toBe(2);
    });

    it('методика не выбрана — отбор как раньше: текущая версия пропускается', () => {
        const selection = selectReanalysisCandidates({
            transcriptions: ['1'].map(row),
            records: [record('1', analysis({}))],
            currentPromptVersion: CALL_REPORT_PROMPT_VERSION,
            roster: null,
        });

        expect(selection.candidates).toEqual([]);
        expect(selection.methodologyOnly).toBe(0);
    });

    it('оценка расхода — по разборам с проходом методики, без них — с пометкой о занижении', () => {
        const withPass = {
            tokens_count: 9000,
            price: 9,
            user_result: analysis({ methodology: 'polyansky@1.2' }),
        };
        const withoutPass = {
            tokens_count: 6000,
            price: 6,
            user_result: analysis({}),
        };

        const exact = estimateReanalysisCostWithMethodology(
            [withPass, withoutPass],
            10,
            METHODOLOGY,
            3,
        );
        expect(exact.basedOnRecords).toBe(1);
        expect(exact.estimatedTokens).toBe(90_000);
        expect(exact.message).toContain(
            'Из кандидатов 3 — разборы текущей версии, сделанные без прохода методики.',
        );
        expect(exact.message).not.toContain('фактический расход будет выше');

        const low = estimateReanalysisCostWithMethodology(
            [withoutPass],
            10,
            METHODOLOGY,
            0,
        );
        expect(low.estimatedTokens).toBe(60_000);
        expect(low.message).toContain('фактический расход будет выше');
    });

    it('методики нет — оценка и текст без изменений', () => {
        const estimate = estimateReanalysisCostWithMethodology(
            [{ tokens_count: 6000, price: 6 }],
            10,
            null,
            0,
        );
        expect(estimate.estimatedTokens).toBe(60_000);
        expect(estimate.message).not.toContain('методик');
    });
});
