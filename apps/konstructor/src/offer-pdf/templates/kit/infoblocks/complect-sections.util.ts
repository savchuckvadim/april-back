import { IInfblockGroupsRenderData } from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import { IOfferWordRenderData } from '@app/konstructor/offer-word/services/render-data-services/offer-render-data.service';
import { groupsWithItems } from './infoblock-description.util';

/** Комплект общего набора, который печатается своим разделом наполнения */
export interface PrintedComplectSection {
    /** Название комплекта; пусто, если не передано */
    title: string;
    /** Подпись поставки; пусто, если не передана */
    supplyName: string;
    /** Группы комплекта, в которых есть хоть один блок */
    groups: IInfblockGroupsRenderData[];
}

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
    const sections = (data.ComplectSections ?? [])
        .map(
            (section): PrintedComplectSection => ({
                title: section.ComplectTitle?.trim() ?? '',
                supplyName: section.ComplectSupplyName?.trim() ?? '',
                groups: groupsWithItems(section.infoblocksByGroups ?? []),
            }),
        )
        .filter(section => section.groups.length > 0);
    return sections.length > 0 ? sections : null;
};

/** В документе есть что печатать в разделе наполнения: по комплектам или одним списком */
export const hasInfoblocksToPrint = (
    data: Pick<
        IOfferWordRenderData,
        'IsComplectsSeparate' | 'ComplectSections' | 'infoblocksByGroups'
    >,
): boolean =>
    printedComplectSections(data) !== null ||
    groupsWithItems(data.infoblocksByGroups ?? []).length > 0;
