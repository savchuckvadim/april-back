import { formatTimecode } from '@lib/call-lib';
import { buildLongCallInputs } from '../long-call-input.util';
import { prepareTranscript } from '../long-call-input-lines.util';
import { overlapCharsFor } from '../long-call-settings.util';
import { splitTranscript } from '../long-call-split.util';
import type { DigestedPart } from '../long-call.types';

/**
 * Размер части из настройки доходит до сборки текстов: строки записи делятся
 * на предложения тем же размером, которым резали части, иначе часть в строках
 * записи не находится (длинная реплика, которую одна резка делит, а другая
 * держит целой).
 */

const SMALL_PART_CHARS = 3_000;
const LINES = 6;
const SENTENCES_PER_LINE = 90;

const sentence = (line: number, index: number): string =>
    `Фраза ${line}-${index} про склад и учёт товара у клиента.`;

/** Шесть длинных реплик (~5 000 знаков): короче 9 000, но длиннее 3 000. */
const TEXT = Array.from(
    { length: LINES },
    (_, line) =>
        `[${formatTimecode(line * 60)}] Клиент: ` +
        Array.from({ length: SENTENCES_PER_LINE }, (_, index) =>
            sentence(line, index),
        ).join(' '),
).join('\n');

const bareParts = (partChars: number): DigestedPart[] =>
    splitTranscript(TEXT, {
        partChars,
        overlapChars: overlapCharsFor(partChars),
    }).map(part => ({ part, digest: null }));

describe('размер части доходит до сборки текстов', () => {
    it('строки записи зависят от размера части: короткая часть делит длинную реплику на предложения', () => {
        const byDefault = prepareTranscript(TEXT);
        const bySmall = prepareTranscript(TEXT, SMALL_PART_CHARS);

        expect(byDefault.lines).toHaveLength(LINES);
        expect(bySmall.lines.length).toBeGreaterThan(LINES);
    });

    it('части найдены в записи, когда передан тот же размер части', () => {
        const parts = bareParts(SMALL_PART_CHARS);
        expect(parts.length).toBeGreaterThan(2);

        const { texts, report } = buildLongCallInputs(
            TEXT,
            parts,
            null,
            SMALL_PART_CHARS,
        );

        expect(report.partsWithoutDigest).toBe(parts.length);
        // Часть без конспекта идёт в отрывки целиком — значит, она найдена в строках.
        expect(texts.whole).toContain('часть 1, конспекта нет');
    });

    it('размер части не передан — используется 9 000: части в записи не находятся', () => {
        const { texts } = buildLongCallInputs(
            TEXT,
            bareParts(SMALL_PART_CHARS),
            null,
        );

        expect(texts.whole).not.toContain('часть 1, конспекта нет');
    });
});
