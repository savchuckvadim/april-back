import { ProductRowDto } from '@app/konstructor/document-generate/dto/product-row/product-row.dto';
import { ProductRowSetItemDto } from '@app/konstructor/document-generate/dto/product-row-set/product-row-set.dto';
import { collectSetRows } from '../lib/collect-set-rows.util';

const row = (name: string): ProductRowDto =>
    ({ name }) as unknown as ProductRowDto;

const names = (rows: ProductRowDto[]): string[] => rows.map(({ name }) => name);

describe('collectSetRows: строки сета для таблицы счёта', () => {
    it('все типы подряд в порядке, присланном фронтом', () => {
        const rows = {
            garant: [row('Гарант-Офис')],
            lt: [row('LegalTech')],
            lt_other: [],
            consalting: [row('Горячая линия')],
            star: [],
            academy: [row('Академия PRO')],
        } as ProductRowSetItemDto;

        expect(names(collectSetRows(rows))).toEqual([
            'Гарант-Офис',
            'LegalTech',
            'Горячая линия',
            'Академия PRO',
        ]);
    });

    it('отсутствующий тип пропускается', () => {
        expect(names(collectSetRows({ garant: [row('Гарант-Офис')] }))).toEqual(
            ['Гарант-Офис'],
        );
    });

    it('null у типа не роняет сбор', () => {
        const rows = {
            garant: [row('Гарант-Офис')],
            consalting: null,
        } as unknown as ProductRowSetItemDto;

        expect(names(collectSetRows(rows))).toEqual(['Гарант-Офис']);
    });

    it('пустой или отсутствующий сет — пустой список', () => {
        expect(collectSetRows({})).toEqual([]);
        expect(collectSetRows(undefined)).toEqual([]);
        expect(collectSetRows(null)).toEqual([]);
    });
});
