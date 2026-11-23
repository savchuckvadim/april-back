import { CONTRACT_LTYPE } from '../../type/contract.type';
import {
    MEASURE_SHORT_PIECE,
    MEASURE_SHORT_SERVICE,
    resolveDocumentMeasure,
} from '../resolve-document-measure.util';

describe('resolveDocumentMeasure', () => {
    describe('сервисный договор', () => {
        it('единица «мес.», подписи нет', () => {
            expect(
                resolveDocumentMeasure(CONTRACT_LTYPE.SERVICE, 'месяц'),
            ).toEqual({ short: 'мес.', caption: '' });
        });

        it('название портала на единицу не влияет', () => {
            for (const name of ['мес.', 'Месяц', 'Лицензия 6 месяцев', '']) {
                expect(
                    resolveDocumentMeasure(CONTRACT_LTYPE.SERVICE, name),
                ).toEqual({ short: MEASURE_SHORT_SERVICE, caption: '' });
            }
        });
    });

    describe('абонемент, лицензия, ключ', () => {
        it.each([
            [CONTRACT_LTYPE.ABON, 'Абонемент 12 месяцев'],
            [CONTRACT_LTYPE.LIC, 'Лицензия 6 месяцев'],
            [CONTRACT_LTYPE.KEY, 'Лицензия'],
        ])('%s: единица «шт.», подпись — название портала', (type, name) => {
            expect(resolveDocumentMeasure(type, name)).toEqual({
                short: MEASURE_SHORT_PIECE,
                caption: name,
            });
        });

        it('лишние пробелы в названии портала срезаются', () => {
            expect(
                resolveDocumentMeasure(
                    CONTRACT_LTYPE.LIC,
                    '  Лицензия 12 месяцев ',
                ),
            ).toEqual({ short: 'шт.', caption: 'Лицензия 12 месяцев' });
        });

        it.each(['шт.', 'шт', 'Шт.', ' штука ', 'мес.', 'Месяц'])(
            'короткое название «%s» подписи не даёт',
            name => {
                expect(
                    resolveDocumentMeasure(CONTRACT_LTYPE.ABON, name),
                ).toEqual({ short: 'шт.', caption: '' });
            },
        );

        it('пустое название портала — единица есть, подписи нет', () => {
            expect(resolveDocumentMeasure(CONTRACT_LTYPE.KEY, '')).toEqual({
                short: 'шт.',
                caption: '',
            });
            expect(
                resolveDocumentMeasure(CONTRACT_LTYPE.LIC, undefined),
            ).toEqual({ short: 'шт.', caption: '' });
            expect(resolveDocumentMeasure(CONTRACT_LTYPE.LIC, null)).toEqual({
                short: 'шт.',
                caption: '',
            });
        });
    });

    describe('вид договора неизвестен', () => {
        it.each([undefined, null, '', 'internet', 'other'])(
            'вид %p: название портала как есть, подписи нет',
            type => {
                expect(
                    resolveDocumentMeasure(type, 'Лицензия 6 месяцев'),
                ).toEqual({ short: 'Лицензия 6 месяцев', caption: '' });
            },
        );

        it('название портала не режется и не нормализуется', () => {
            expect(resolveDocumentMeasure(undefined, ' мес. ')).toEqual({
                short: ' мес. ',
                caption: '',
            });
        });

        it('нет и названия — пустая единица', () => {
            expect(resolveDocumentMeasure(undefined, undefined)).toEqual({
                short: '',
                caption: '',
            });
            expect(resolveDocumentMeasure(null, null)).toEqual({
                short: '',
                caption: '',
            });
        });
    });
});
