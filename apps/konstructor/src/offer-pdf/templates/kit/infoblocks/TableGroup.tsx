import type { FC } from 'react';
import { IInfblockGroupsRenderData } from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import { DocumentFieldDescriptionMode } from '../../../model/offer-document-settings.type';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { DescriptionRow } from './DescriptionRow';
import { GroupHead } from './GroupHead';
import { HeadWithFirst } from './HeadWithFirst';
import { isLongInfoblock } from './infoblock-description.util';
import { TABLE_DESC_CHARS, TABLE_GROUP_HEAD } from './infoblocks.layout';
import { NamesRows } from './NamesRows';
import { TableRows } from './TableRows';

export interface TableGroupProps {
    group: IInfblockGroupsRenderData;
    mode: DocumentFieldDescriptionMode;
    theme: OfferPdfTheme;
}

/**
 * Группа в таблице: шапка вместе с первой строкой (с первой парой, когда
 * названия идут в две колонки), затем остальные строки.
 */
export const TableGroup: FC<TableGroupProps> = ({ group, mode, theme }) => {
    const withDescription = mode !== DocumentFieldDescriptionMode.NO;
    const firstCount = withDescription ? 1 : 2;
    const [first] = group.infoblocks;

    return (
        <>
            <HeadWithFirst
                head={<GroupHead name={group.groupsName} theme={theme} />}
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
                headHeight={TABLE_GROUP_HEAD}
            />
            <TableRows
                items={group.infoblocks.slice(firstCount)}
                mode={mode}
                theme={theme}
            />
        </>
    );
};
