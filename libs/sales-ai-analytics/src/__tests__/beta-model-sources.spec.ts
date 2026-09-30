import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LIB_SRC_DIR } from './param-codes.fixture';

/**
 * Инварианты исходников модели β (план §4.11 «воспроизводимость»,
 * приёмка §6): ни `Date.now`, ни `new Date()` без аргумента, ни
 * `Math.random`; слова «значимо» нет ни в коде, ни в комментариях.
 */
const MODEL_FILES = [
    'near-outcome.ts',
    'beta-sample.types.ts',
    'beta-sample.score.ts',
    'beta-sample.ts',
    'beta-irls.ts',
    'beta-fit.types.ts',
    'beta-fit.design.ts',
    'beta-fit.ts',
    'beta-calibration.ts',
    'beta-placebo.ts',
    'beta-gate.ts',
    'beta-curve.ts',
] as const;

const FORBIDDEN_SOURCE = [
    /Date\.now\s*\(/,
    /new Date\s*\(\s*\)/,
    /Math\.random/,
];
const FORBIDDEN_WORD = /значим/iu;

describe('исходники модели β: детерминизм и запрещённые слова', () => {
    it.each(MODEL_FILES)('%s без Date.now / new Date() / Math.random', file => {
        const text = readFileSync(join(LIB_SRC_DIR, 'model', file), 'utf8');
        FORBIDDEN_SOURCE.forEach(pattern => {
            expect(pattern.test(text)).toBe(false);
        });
    });

    it.each(MODEL_FILES)('%s без слова «значимо» даже в комментариях', file => {
        const text = readFileSync(join(LIB_SRC_DIR, 'model', file), 'utf8');
        expect(FORBIDDEN_WORD.test(text)).toBe(false);
    });

    it.each(MODEL_FILES)('%s не длиннее 300 строк', file => {
        const lines = readFileSync(
            join(LIB_SRC_DIR, 'model', file),
            'utf8',
        ).split('\n');
        expect(lines.length).toBeLessThanOrEqual(301);
    });
});
