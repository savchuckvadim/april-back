import { toMatrixRow } from '../domain/assembler/manager-type-matrix.assembler';
import type { DatedLiteRow } from '../domain/loaders/lite-row.mapper';
import { liteRow } from './fixtures/lite-row.fixture';

/**
 * Чек-листы «Хвост» и 5К в строках матрицы витрины — только у презентаций
 * (решение владельца 18.11.2026). Lite-выборка флаги сейчас не отдаёт;
 * правило страхует день, когда начнёт.
 */
const rowOf = (
    callType: string,
): DatedLiteRow & { hvostDone: boolean; fiveKDone: boolean } => ({
    ...(liteRow({ transcriptionId: '1', callType }) as DatedLiteRow),
    hvostDone: true,
    fiveKDone: false,
});

describe('матрица витрины: чек-листы только у презентаций', () => {
    it('презентация — флаги «Хвост» и «5К» попадают в строку матрицы', () => {
        const row = toMatrixRow(rowOf('presentation'));
        expect(row.hvostDone).toBe(true);
        expect(row.fiveKDone).toBe(false);
    });

    it('звонок по решению и другие типы — флагов в строке нет', () => {
        for (const callType of ['decision', 'refine', 'call']) {
            const row = toMatrixRow(rowOf(callType));
            expect(row.hvostDone).toBeUndefined();
            expect(row.fiveKDone).toBeUndefined();
            expect(row.transcriptionId).toBe('1');
        }
    });
});
