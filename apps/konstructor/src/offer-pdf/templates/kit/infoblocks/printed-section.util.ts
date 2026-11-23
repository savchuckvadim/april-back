import { IInfblockGroupsRenderData } from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import { IComplectSectionRenderData } from '@app/konstructor/offer-word/services/render-data-services/offer-render-infoblocks.service';
import { groupsWithItems } from './infoblock-description.util';

/** Комплект, который печатается своим разделом наполнения */
export interface PrintedComplectSection {
    /** Название комплекта; пусто, если не передано */
    title: string;
    /** Подпись поставки; пусто, если не передана */
    supplyName: string;
    /** Группы комплекта, в которых есть хоть один блок */
    groups: IInfblockGroupsRenderData[];
}

/**
 * Раздел комплекта в виде, готовом к печати: название и поставка без
 * пробелов по краям, из групп только те, где есть блоки.
 */
export const printedSectionOf = (
    section: IComplectSectionRenderData,
): PrintedComplectSection => ({
    title: section.ComplectTitle?.trim() ?? '',
    supplyName: section.ComplectSupplyName?.trim() ?? '',
    groups: groupsWithItems(section.infoblocksByGroups ?? []),
});

/** Разделы комплектов, в которых есть что печатать; пустые пропущены */
export const printedSectionsOf = (
    sections: readonly IComplectSectionRenderData[],
): PrintedComplectSection[] =>
    sections.map(printedSectionOf).filter(section => section.groups.length > 0);
