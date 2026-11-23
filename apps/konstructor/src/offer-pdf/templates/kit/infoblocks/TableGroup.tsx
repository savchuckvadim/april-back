import type { FC } from 'react';
import { IInfblockGroupsRenderData } from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import { DocumentFieldDescriptionMode } from '../../../model/offer-document-settings.type';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { DescriptionRow } from './DescriptionRow';
import { GroupHead } from './GroupHead';
import { HeadWithFirst } from './HeadWithFirst';
import { isLongInfoblock } from './infoblock-description.util';
import { TABLE_DESC_CHARS, TABLE_GROUP_HEAD } from './infoblocks.layout';
import type { InfoblocksLead } from './infoblocks-lead';
import { NamesRows } from './NamesRows';
import { TableRows } from './TableRows';

export interface TableGroupProps {
    group: IInfblockGroupsRenderData;
    mode: DocumentFieldDescriptionMode;
    theme: OfferPdfTheme;
    /** Блок перед шапкой группы: у первой группы раздела комплекта */
    lead?: InfoblocksLead;
    /** Шапка группы печатается; false — таблица без разделов, строки одним списком */
    withHead?: boolean;
}

/**
 * Группа в таблице: шапка вместе с первой строкой (с первой парой, когда
 * названия идут в две колонки), затем остальные строки.
 */
export const TableGroup: FC<TableGroupProps> = ({
    group,
    mode,
    theme,
    lead,
    withHead = true,
}) => {
    const withDescription = mode !== DocumentFieldDescriptionMode.NO;
    const firstCount = withDescription ? 1 : 2;
    const [first] = group.infoblocks;

    return (
        <>
            <HeadWithFirst
                lead={lead}
                head={
                    withHead ? (
                        <GroupHead name={group.groupsName} theme={theme} />
                    ) : null
                }
                first={
                    withDescription ? (
                        <DescriptionRow
                            infoblock={first}
                            mode={mode}
                            theme={theme}
                            gate={false}
                        />
                    ) : (
                        <NamesRows
                            items={group.infoblocks.slice(0, firstCount)}
                            theme={theme}
                        />
                    )
                }
                firstLong={
                    withDescription &&
                    isLongInfoblock(first, mode, TABLE_DESC_CHARS)
                }
                headHeight={withHead ? TABLE_GROUP_HEAD : 0}
            />
            <TableRows
                items={group.infoblocks.slice(firstCount)}
                mode={mode}
                theme={theme}
            />
        </>
    );
};
