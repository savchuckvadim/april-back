import { IOfferWordRenderData } from '@app/konstructor/offer-word/services/render-data-services/offer-render-data.service';
import { printedAlternativeSets } from './alternative-sets.util';
import { groupsWithItems } from './infoblock-description.util';
import {
    printedSectionsOf,
    type PrintedComplectSection,
} from './printed-section.util';

/**
 * Разделы наполнения по комплектам. Печатаются, когда в данных стоит
 * `IsComplectsSeparate` и хотя бы у одного комплекта есть наполнение: комплекты
 * без блоков пропускаются. null — наполнение печатается одним объединённым
 * списком из `infoblocksByGroups`, как раньше.
 */
export const printedComplectSections = (
    data: Pick<
        IOfferWordRenderData,
        'IsComplectsSeparate' | 'ComplectSections'
    >,
): PrintedComplectSection[] | null => {
    if (!data.IsComplectsSeparate) return null;
    const sections = printedSectionsOf(data.ComplectSections ?? []);
    return sections.length > 0 ? sections : null;
};

/**
 * В документе есть что печатать в разделе наполнения: по комплектам, одним
 * списком или наполнение наборов для сравнения
 */
export const hasInfoblocksToPrint = (
    data: Pick<
        IOfferWordRenderData,
        | 'IsComplectsSeparate'
        | 'ComplectSections'
        | 'infoblocksByGroups'
        | 'IsAlternativeComplects'
        | 'AlternativeComplectSections'
    >,
): boolean =>
    printedComplectSections(data) !== null ||
    groupsWithItems(data.infoblocksByGroups ?? []).length > 0 ||
    printedAlternativeSets(data) !== null;
