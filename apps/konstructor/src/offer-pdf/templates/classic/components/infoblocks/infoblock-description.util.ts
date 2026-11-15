import {
    IInfblockGroupsRenderData,
    IInfblockRenderData,
} from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import { DocumentFieldDescriptionMode } from '../../../../model/offer-document-settings.type';
import { estimateLines } from '../../classic.util';
import { KEEP_WHOLE_LINES } from './infoblocks.layout';

/**
 * Описание по режиму. Если нужного размера нет — берём ближайший, чтобы
 * «много» на блоке без длинного текста не превращалось в пустоту.
 */
export const pickInfoblockDescription = (
    infoblock: IInfblockRenderData,
    mode: DocumentFieldDescriptionMode,
): string | null => {
    if (mode === DocumentFieldDescriptionMode.NO) return null;
    const { smallDescription, mediumDescription, bigDescription } = infoblock;
    const order =
        mode === DocumentFieldDescriptionMode.BIG
            ? [bigDescription, mediumDescription, smallDescription]
            : mode === DocumentFieldDescriptionMode.MEDIUM
              ? [mediumDescription, smallDescription, bigDescription]
              : [smallDescription, mediumDescription, bigDescription];
    const found = order.find(text => text?.trim().length);
    return found ? found.trim() : null;
};

/** Описание длиннее KEEP_WHOLE_LINES строк колонки — блок режется по странице */
export const isLongDescription = (
    description: string | null,
    charsPerLine: number,
): boolean =>
    Boolean(description) &&
    estimateLines(description as string, charsPerLine) > KEEP_WHOLE_LINES;

/** Описание блока по режиму длинное — блок режется по странице */
export const isLongInfoblock = (
    infoblock: IInfblockRenderData,
    mode: DocumentFieldDescriptionMode,
    charsPerLine: number,
): boolean =>
    isLongDescription(pickInfoblockDescription(infoblock, mode), charsPerLine);

/** Группы, в которых есть хоть один блок */
export const groupsWithItems = (
    groups: IInfblockGroupsRenderData[],
): IInfblockGroupsRenderData[] =>
    groups.filter(group => group.infoblocks.length > 0);
