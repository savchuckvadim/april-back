import {
    analysisPreviewKey,
    parseAnalysisPreviewState,
    queuedAnalysisPreview,
} from '../analysis-preview.types';

const DATA = {
    previewId: '0b9f1c9e-6f0e-4a59-9f2b-0f7a8c1d2e3f',
    domain: 'gsr.bitrix24.ru',
    transcriptionId: '184523',
};

describe('состояние проверки разбора на звонке', () => {
    it('ключ Redis свой, не пересекается с проверкой методики', () => {
        expect(analysisPreviewKey(DATA.previewId)).toBe(
            `call-report:analysis-preview:${DATA.previewId}`,
        );
    });

    it('«в очереди» — без итога и ошибки; читается обратно из строки', () => {
        const state = queuedAnalysisPreview(
            DATA,
            new Date('2026-11-18T11:00:00.000Z'),
        );
        expect(state).toEqual({
            ...DATA,
            status: 'queued',
            error: null,
            result: null,
            updatedAt: '2026-11-18T11:00:00.000Z',
        });
        expect(parseAnalysisPreviewState(JSON.stringify(state))).toEqual(state);
    });

    it('битый JSON, чужая форма и незнакомый статус — null', () => {
        expect(parseAnalysisPreviewState(null)).toBeNull();
        expect(parseAnalysisPreviewState('{не json')).toBeNull();
        expect(parseAnalysisPreviewState('[]')).toBeNull();
        expect(
            parseAnalysisPreviewState(
                JSON.stringify({ ...DATA, status: 'lost' }),
            ),
        ).toBeNull();
    });
});
