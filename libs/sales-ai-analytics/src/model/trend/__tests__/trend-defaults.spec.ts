import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    AI_ANALYTICS_PARAM_DEFAULTS,
    findParam,
} from '../../../params/registry.const';
import { TREND_DEFAULTS } from '../trend-defaults';

/**
 * Дефолты трендов берутся из реестра (находка M8 аудита Фазы 2): поле
 * либо равно `defaultValue` кода реестра, либо объявлено константой
 * метода с пометкой «не параметр реестра» над объявлением — по образцу
 * `lib-defaults.spec.ts` (объект сюда не подключён: спека библиотеки
 * принадлежит другому потоку, handoff в отчёте П1).
 */
const REGISTRY_FIELDS = [
    ['alphaShort', 'trend_ewma_short'],
    ['alphaLong', 'trend_ewma_long'],
    ['sigmaK', 'trend_sigma_k'],
    ['fwer', 'trend_fwer'],
    ['windowCalls', 'trend_window_calls'],
    ['xmrSigma', 'xmr_sigma'],
    ['comparableWeeks', 'calibration_comparable_weeks'],
] as const satisfies readonly (readonly [
    keyof typeof TREND_DEFAULTS,
    string,
])[];

const LOCAL_FIELDS = [
    'cusumK',
    'cusumH',
    'baselinePoints',
    'minPoints',
    'okPoints',
    'consecutive',
    'iterations',
    'holdoutPoints',
] as const satisfies readonly (keyof typeof TREND_DEFAULTS)[];

const LOCAL_MARKER = 'е параметр реестра';
const MARKER_LOOKBEHIND_LINES = 8;

const source = readFileSync(join(__dirname, '..', 'trend-defaults.ts'), 'utf8');

const hasLocalMarker = (field: string): boolean => {
    const lines = source.split(/\r?\n/);
    const declaration = new RegExp(`^\\s*${field}:`);

    return lines.some(
        (line, index) =>
            declaration.test(line) &&
            lines
                .slice(Math.max(0, index - MARKER_LOOKBEHIND_LINES), index)
                .some(above => above.toLowerCase().includes(LOCAL_MARKER)),
    );
};

describe('TREND_DEFAULTS: величины из реестра параметров', () => {
    it.each(REGISTRY_FIELDS)('%s = defaultValue кода %s', (field, code) => {
        expect(findParam(code)).toBeDefined();
        expect(TREND_DEFAULTS[field]).toBe(AI_ANALYTICS_PARAM_DEFAULTS[code]);
    });

    it('каждое поле — либо из реестра, либо локальная константа метода', () => {
        const covered = [
            ...REGISTRY_FIELDS.map(([field]) => field),
            ...LOCAL_FIELDS,
        ];
        expect(Object.keys(TREND_DEFAULTS).sort()).toEqual([...covered].sort());
    });

    it.each(LOCAL_FIELDS)('%s помечено «не параметр реестра»', field => {
        expect({ field, marked: hasLocalMarker(field) }).toEqual({
            field,
            marked: true,
        });
    });

    it('минимум точек согласован с базовой линией CUSUM, ok — удвоенный минимум', () => {
        expect(TREND_DEFAULTS.minPoints).toBe(TREND_DEFAULTS.baselinePoints);
        expect(TREND_DEFAULTS.okPoints).toBe(2 * TREND_DEFAULTS.minPoints);
        expect(TREND_DEFAULTS.cusumK).toBeLessThan(TREND_DEFAULTS.cusumH);
    });
});
