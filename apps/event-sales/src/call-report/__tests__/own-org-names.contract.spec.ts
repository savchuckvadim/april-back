import {
    normalizeOwnOrgNames,
    renderOwnOrgNamesBlock,
    renderOwnOrgNamesHint,
} from '../contracts/own-org-names.contract';

/**
 * Прод-случай alfacentr (08.09.2026): «Альфа-центр» — это компания-клиент
 * портала, а разбор считал её сторонней организацией и снижал оценку.
 */
describe('own-org-names.contract', () => {
    describe('normalizeOwnOrgNames', () => {
        it('чистит пробелы, пустые и дубликаты без учёта регистра', () => {
            expect(
                normalizeOwnOrgNames([
                    '  Альфа-центр ',
                    'альфа-центр',
                    '',
                    ' ',
                    'А',
                    'Апрель',
                ]),
            ).toEqual(['Альфа-центр', 'Апрель']);
        });

        it('null и undefined дают пустой список', () => {
            expect(normalizeOwnOrgNames(null)).toEqual([]);
            expect(normalizeOwnOrgNames(undefined)).toEqual([]);
        });
    });

    describe('renderOwnOrgNamesBlock', () => {
        it('называет имена и ПРЯМО запрещает «стороннюю организацию» и снижение оценки', () => {
            const block = renderOwnOrgNamesBlock(['Альфа-центр', 'Апрель']);

            expect(block).toContain('«Альфа-центр»');
            expect(block).toContain('«Апрель»');
            expect(block).toContain('Это МЫ');
            expect(block).toContain('ЗАПРЕЩЕНО');
            expect(block).toContain('стороннюю организацию');
            expect(block).toContain('снижать за это оценку');
        });

        it('пустой список — пустая строка: промпт не меняется вовсе', () => {
            expect(renderOwnOrgNamesBlock([])).toBe('');
            expect(renderOwnOrgNamesBlock(null)).toBe('');
            expect(renderOwnOrgNamesBlock(['  '])).toBe('');
        });
    });

    describe('renderOwnOrgNamesHint', () => {
        it('классификатору говорит, что это представление менеджера', () => {
            const hint = renderOwnOrgNamesHint(['Альфа-центр']);

            expect(hint).toContain('«Альфа-центр»');
            expect(hint).toContain('представляет СЕБЯ');
        });

        it('пустой список — пустая подсказка', () => {
            expect(renderOwnOrgNamesHint([])).toBe('');
        });
    });
});
