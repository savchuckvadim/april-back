import {
    MissingColumnsError,
    SheetNotFoundError,
    hasSheet,
    readSheet,
    readWorkbook,
} from '../lib/sheet-reader';
import { writeWorkbook } from '../lib/sheet-writer';

/** Книга из описаний листов — тот же путь, которым бэк отдаёт эталон */
const buildWorkbook = async (
    rows: (string | number | boolean | null)[][],
    headers: string[],
    name = 'regions',
): Promise<Buffer> => await writeWorkbook([{ name, headers, rows }]);

describe('sheet-reader', () => {
    it('читает строки по именам колонок независимо от их порядка', async () => {
        const buffer = await buildWorkbook(
            [['ud', 4177.2, 'Алтайский край']],
            ['code', 'abs', 'title'],
        );
        const sheet = readSheet(await readWorkbook(buffer), 'regions');

        expect(sheet.rows).toHaveLength(1);
        expect(sheet.rows[0].string('code')).toBe('ud');
        expect(sheet.rows[0].number('abs')).toBe(4177.2);
        expect(sheet.rows[0].string('title')).toBe('Алтайский край');
    });

    it('терпит денежный формат и запятую как разделитель', async () => {
        const buffer = await buildWorkbook(
            [['ud', '8 187,50 р.']],
            ['code', 'abs'],
        );
        const sheet = readSheet(await readWorkbook(buffer), 'regions');

        expect(sheet.rows[0].number('abs')).toBe(8187.5);
    });

    it('нечисловое значение даёт null, а не 0', async () => {
        const buffer = await buildWorkbook(
            [['ud', 'уточнить']],
            ['code', 'abs'],
        );
        const sheet = readSheet(await readWorkbook(buffer), 'regions');

        expect(sheet.rows[0].number('abs')).toBeNull();
        expect(sheet.rows[0].nullableString('abs')).toBe('уточнить');
    });

    it('пустые строки пропускаются', async () => {
        const buffer = await buildWorkbook(
            [
                ['ud', 1],
                [null, null],
                ['msk', 2],
            ],
            ['code', 'abs'],
        );
        const sheet = readSheet(await readWorkbook(buffer), 'regions');

        expect(sheet.rows.map(row => row.string('code'))).toEqual([
            'ud',
            'msk',
        ]);
    });

    it('имя листа матчится без учёта регистра, отсутствующий лист — понятная ошибка', async () => {
        const workbook = await readWorkbook(
            await buildWorkbook([['ud']], ['code'], 'Regions'),
        );

        expect(readSheet(workbook, 'regions').name).toBe('Regions');
        expect(hasSheet(workbook, 'REGIONS')).toBe(true);
        expect(hasSheet(workbook, 'prices')).toBe(false);
        expect(() => readSheet(workbook, 'prices')).toThrow(SheetNotFoundError);
        expect(() => readSheet(workbook, 'prices')).toThrow(/Regions/);
    });

    it('отсутствие обязательной колонки — ошибка с её именем', async () => {
        const sheet = readSheet(
            await readWorkbook(await buildWorkbook([['ud']], ['kod'])),
            'regions',
        );

        expect(() => sheet.requireColumns(['code'])).toThrow(
            MissingColumnsError,
        );
        expect(() => sheet.requireColumns(['code'])).toThrow(/code/);
        expect(() => sheet.requireColumns(['KOD'])).not.toThrow();
    });

    it('columnsExcept отдаёт колонки матрицы без ключевых', async () => {
        const sheet = readSheet(
            await readWorkbook(
                await buildWorkbook(
                    [['buh', 'Бухгалтер', 100, 200]],
                    ['complect_code', 'name', 'internet_1', 'proxima_local'],
                ),
            ),
            'regions',
        );

        expect(sheet.rows[0].columnsExcept(['complect_code', 'name'])).toEqual([
            'internet_1',
            'proxima_local',
        ]);
    });

    it('has отличает отсутствующую колонку от пустой ячейки', async () => {
        const sheet = readSheet(
            await readWorkbook(
                await buildWorkbook([['ud', null]], ['code', 'abs']),
            ),
            'regions',
        );

        expect(sheet.rows[0].has('abs')).toBe(true);
        expect(sheet.rows[0].nullableString('abs')).toBeNull();
        expect(sheet.rows[0].has('title')).toBe(false);
    });

    it('булевы значения читаются из 1/true/да', async () => {
        const sheet = readSheet(
            await readWorkbook(
                await buildWorkbook(
                    [['a', true, 1, 'да', 'нет', null]],
                    ['code', 'f1', 'f2', 'f3', 'f4', 'f5'],
                ),
            ),
            'regions',
        );
        const row = sheet.rows[0];

        expect(row.boolean('f1')).toBe(true);
        expect(row.boolean('f2')).toBe(true);
        expect(row.boolean('f3')).toBe(true);
        expect(row.boolean('f4')).toBe(false);
        expect(row.boolean('f5')).toBe(false);
    });
});
