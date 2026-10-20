import {
    aiAnalyticsCacheResetFilter,
    AI_ANALYTICS_CACHE_PREFIX,
} from '../../../contracts/cache.const';
import {
    mergeStageFlags,
    MODEL_PARAMS_MESSAGES,
    parseModelParamsJson,
    stageFlagOf,
} from '../launch-model-params';

/**
 * JSON переопределений модели: строгий разбор (битое — ошибка, а не «{}»)
 * и мёрж только флагов ступеней — чужие ключи владельца не теряются.
 */
describe('parseModelParamsJson', () => {
    it('пусто, пробелы, null и undefined — пустой объект', () => {
        for (const raw of ['', '   ', null, undefined]) {
            expect(parseModelParamsJson(raw)).toEqual({ ok: true, value: {} });
        }
    });

    it('объект разбирается как есть', () => {
        expect(
            parseModelParamsJson(' {"forget_lambda":0.85,"n_min_none":8} '),
        ).toEqual({ ok: true, value: { forget_lambda: 0.85, n_min_none: 8 } });
    });

    it('битый JSON — ошибка с текстом разбора', () => {
        const result = parseModelParamsJson('{"forget_lambda":');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.startsWith(MODEL_PARAMS_MESSAGES.invalid)).toBe(
                true,
            );
        }
    });

    it('массив, число и не-строка — ошибка «не объект» / «не строка»', () => {
        expect(parseModelParamsJson('[1,2]')).toEqual({
            ok: false,
            error: MODEL_PARAMS_MESSAGES.notObject,
        });
        expect(parseModelParamsJson('42')).toEqual({
            ok: false,
            error: MODEL_PARAMS_MESSAGES.notObject,
        });
        expect(parseModelParamsJson({ a: 1 })).toEqual({
            ok: false,
            error: MODEL_PARAMS_MESSAGES.notString,
        });
    });
});

describe('mergeStageFlags', () => {
    it('меняет только флаги ступеней, остальные ключи как были', () => {
        const current = {
            forget_lambda: 0.85,
            recommendations_stage_enabled: true,
        };
        const { merged, changed } = mergeStageFlags(current, {
            forecast: true,
        });
        expect(merged).toEqual({
            forget_lambda: 0.85,
            recommendations_stage_enabled: true,
            forecast_stage_enabled: true,
        });
        expect(changed).toEqual(['forecast_stage_enabled']);
        expect(current).not.toHaveProperty('forecast_stage_enabled');
    });

    it('значение уже такое — changed пуст; не заданный флаг не трогается', () => {
        const { merged, changed } = mergeStageFlags(
            { forecast_stage_enabled: true },
            { forecast: true },
        );
        expect(changed).toEqual([]);
        expect(merged).toEqual({ forecast_stage_enabled: true });
        expect(mergeStageFlags({}, { recommendations: false }).merged).toEqual({
            recommendations_stage_enabled: false,
        });
    });

    it('stageFlagOf — только явный true', () => {
        expect(
            stageFlagOf(
                { forecast_stage_enabled: true },
                'forecast_stage_enabled',
            ),
        ).toBe(true);
        expect(
            stageFlagOf(
                { forecast_stage_enabled: 'true' },
                'forecast_stage_enabled',
            ),
        ).toBe(false);
        expect(stageFlagOf({}, 'forecast_stage_enabled')).toBe(false);
    });
});

describe('aiAnalyticsCacheResetFilter', () => {
    it('all — весь кэш домена без keyPrefix, секция — keyPrefix', () => {
        expect(aiAnalyticsCacheResetFilter('gsr.bitrix24.ru', 'all')).toEqual({
            app: AI_ANALYTICS_CACHE_PREFIX,
            domain: 'gsr.bitrix24.ru',
        });
        expect(aiAnalyticsCacheResetFilter('gsr.bitrix24.ru', 'pulse')).toEqual(
            {
                app: 'sales-ai-analytics:v1',
                domain: 'gsr.bitrix24.ru',
                keyPrefix: 'pulse',
            },
        );
    });
});
