import {
    AI_ANALYSIS_SERIES_START,
    versionsSeriesKey,
    type AnalysisVersions,
} from '../versions.types';

/** Набор версий разбора 3.1 — как пишет его event-sales с 06.11.2026. */
const V31: AnalysisVersions = {
    prompt: 'focus-v3.1-2026-11-06',
    rubric: 'sections-7-v2',
    registry: 'a1b2c3d4e5f6',
    attribution: '2026-08-24',
    classifier: '2026-10-21',
};

describe('versionsSeriesKey — серия сравнимости набора версий', () => {
    it('минорные версии промпта 3.1 → 3.2 → 3.3 — одна серия', () => {
        const keys = [
            V31,
            { ...V31, prompt: 'focus-v3.2-2026-11-16' },
            { ...V31, prompt: 'focus-v3.3-2026-11-17' },
        ].map(versionsSeriesKey);

        expect(keys).toEqual([
            AI_ANALYSIS_SERIES_START,
            AI_ANALYSIS_SERIES_START,
            AI_ANALYSIS_SERIES_START,
        ]);
    });

    it('версия промпта без записи в таблице серий — новая серия от даты в строке', () => {
        expect(
            versionsSeriesKey({ ...V31, prompt: 'focus-v4.0-2026-11-24' }),
        ).toBe('2026-11-24');
    });

    it('атрибуция и классификатор из таблиц серий серию не меняют, вне таблиц — меняют', () => {
        expect(versionsSeriesKey({ ...V31, classifier: '2026-09-05' })).toBe(
            AI_ANALYSIS_SERIES_START,
        );
        expect(versionsSeriesKey({ ...V31, attribution: '2026-12-05' })).toBe(
            '2026-12-05',
        );
        expect(versionsSeriesKey({ ...V31, classifier: '2026-12-07' })).toBe(
            '2026-12-07',
        );
    });

    it('рубрика, хэш реестра и методика дат не несут — серию не меняют (как граница сравнимости)', () => {
        expect(
            versionsSeriesKey({
                ...V31,
                rubric: 'sections-7-v1',
                registry: 'builtin',
                methodology: 'polyansky@1.2',
            }),
        ).toBe(AI_ANALYSIS_SERIES_START);
    });

    it('набор без единой даты и пустой набор — серия неизвестна (null)', () => {
        expect(
            versionsSeriesKey({ prompt: 'focus-v3', rubric: 'sections-7-v1' }),
        ).toBeNull();
        expect(versionsSeriesKey({})).toBeNull();
    });
});
