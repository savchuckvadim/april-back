import {
    findOfferLetterMarkupError,
    OFFER_LETTER_MARKUP_TAGS,
} from '@lib/portal-lib/konstructor';
import { parseRichText } from '@app/konstructor/offer-pdf/templates/shared/rich-text';

/**
 * Список тегов админки (то, что пропускает проверка и что даёт редактор) и
 * разбор разметки в PDF-КП (`parseRichText`) держатся вручную. Тест ловит
 * расхождение: тег, который админка разрешила, а PDF напечатал бы буквами.
 */
describe('разметка письма КП: админка и PDF-КП понимают одни теги', () => {
    it.each(OFFER_LETTER_MARKUP_TAGS)(
        'тег <%s> разбирается PDF-КП как стиль, а не как текст',
        tag => {
            expect(
                findOfferLetterMarkupError(`<${tag}>текст</${tag}>`),
            ).toBeNull();

            const runs = parseRichText(`до <${tag}>внутри</${tag}> после`);

            expect(runs.map(run => run.text).join('')).toBe('до внутри после');
            const styled = runs.find(run => run.text === 'внутри');
            expect(styled?.[tag]).toBe(true);
        },
    );

    it('теги, которых нет в списке админки, PDF-КП тоже не разбирает', () => {
        const runs = parseRichText('до <b>внутри</b> после');
        expect(runs).toHaveLength(1);
        expect(
            findOfferLetterMarkupError('до <b>внутри</b> после'),
        ).not.toBeNull();
    });
});
