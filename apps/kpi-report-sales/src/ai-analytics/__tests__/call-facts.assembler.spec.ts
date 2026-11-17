import type { AnalyticsLiteSection } from '@lib/call-lib';
import { assembleCallFacts } from '../domain/assembler/call-facts.assembler';
import { defaultAttentionThresholds } from '../domain/loaders/attention-thresholds.util';
import {
    hasCallDate,
    type DatedLiteRow,
} from '../domain/loaders/lite-row.mapper';
import { liteRow } from './fixtures/lite-row.fixture';

/**
 * Сборка фактов звонков обзора: факты качества кладутся по звонкам слоя
 * качества и порогам опций. Сами факты качества и их тесты переехали в
 * @lib/sales-ai-analytics (quality-facts.assembler.spec.ts, 17.11.2026).
 */
const section = (code: string, score: number): AnalyticsLiteSection => ({
    section: code,
    relevance: 1,
    score,
    asWas: null,
    alternatives: [],
});

const row = (id: string, patch: Partial<DatedLiteRow> = {}): DatedLiteRow =>
    [
        liteRow({
            transcriptionId: id,
            managerId: '10',
            callType: 'presentation',
            ...patch,
        }),
    ].filter(hasCallDate)[0];

const THRESHOLDS = defaultAttentionThresholds();

describe('assembleCallFacts', () => {
    it('кладёт факты качества по звонкам слоя качества и порогам опций', () => {
        const facts = assembleCallFacts(
            [
                row('p1', { sections: [section('NEEDS', 4)], score: 30 }),
                // Короткий звонок — вне слоя качества.
                row('short', {
                    durationSec: 10,
                    sections: [section('NEEDS', 1)],
                    score: 10,
                }),
            ],
            {
                to: '2026-09-06',
                timeZone: 'Europe/Moscow',
                thresholds: { ...THRESHOLDS, lowScoreCallMax: 2 },
            },
        );
        const quality = facts.get('10')?.quality;
        expect(quality?.presentation.n).toBe(1);
        expect(quality?.presentation.weakCallIds).toEqual(['p1']);
        expect(quality?.lowScoreCalls).toEqual([]);
        expect(quality?.thresholds.lowScoreCallMax).toBe(2);
    });
});
