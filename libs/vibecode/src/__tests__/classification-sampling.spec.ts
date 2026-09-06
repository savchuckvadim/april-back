import { sampleTranscriptForClassification } from '../vibecode.client';

describe('sampleTranscriptForClassification — выжимка для классификатора', () => {
    it('короткий транскрипт отдаётся без изменений', () => {
        expect(sampleTranscriptForClassification('алло', 100)).toBe('алло');
    });

    it('длинный: начало (две трети) + маркер пропуска + конец (треть), лимит соблюдён', () => {
        const head = 'A'.repeat(500);
        const middle = 'M'.repeat(2000);
        const tail = 'Z'.repeat(500);
        const sampled = sampleTranscriptForClassification(
            head + middle + tail,
            300,
        );
        expect(sampled.startsWith('A'.repeat(198))).toBe(true);
        expect(sampled.endsWith('Z'.repeat(102))).toBe(true);
        expect(sampled).toContain('середина разговора пропущена');
        expect(sampled).not.toContain('M');
        // Текст разговора в выжимке — ровно лимит (без учёта маркера).
        expect(sampled.replace(/\n\n\[[^\]]+\]\n\n/, '')).toHaveLength(300);
    });
});
