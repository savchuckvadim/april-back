import { IOfferWordRenderData } from '@app/konstructor/offer-word/services/render-data-services/offer-render-data.service';
import {
    printedSectionsOf,
    type PrintedComplectSection,
} from './printed-section.util';

/** Общий заголовок блока наполнения наборов для сравнения */
export const ALTERNATIVE_BLOCK_TITLE = 'Наполнение наборов для сравнения';

/** Набор для сравнения, наполнение которого печатается своим разделом */
export interface PrintedAlternativeSet {
    /** Номер набора для сравнения (от 1) */
    number: number;
    /** Заголовок набора; без него — «Набор N» */
    title: string;
    /** Комплекты набора, в которых есть наполнение */
    sections: PrintedComplectSection[];
}

/**
 * Наполнение наборов для сравнения. Печатается, когда в данных стоит
 * `IsAlternativeComplects` и хотя бы у одного набора есть комплект с наполнением:
 * наборы и комплекты без блоков пропускаются. Порядок — порядок запроса.
 * null — блока нет, документ печатается как раньше.
 */
export const printedAlternativeSets = (
    data: Pick<
        IOfferWordRenderData,
        'IsAlternativeComplects' | 'AlternativeComplectSections'
    >,
): PrintedAlternativeSet[] | null => {
    if (!data.IsAlternativeComplects) return null;
    const sets = (data.AlternativeComplectSections ?? [])
        .map(
            (set): PrintedAlternativeSet => ({
                number: set.AlternativeSetNumber,
                title:
                    set.AlternativeSetTitle?.trim() ||
                    `Набор ${set.AlternativeSetNumber}`,
                sections: printedSectionsOf(set.ComplectSections ?? []),
            }),
        )
        .filter(set => set.sections.length > 0);
    return sets.length > 0 ? sets : null;
};
