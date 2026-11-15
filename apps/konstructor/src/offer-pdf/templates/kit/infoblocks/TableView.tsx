import type { FC } from 'react';
import { View } from '@react-pdf/renderer';
import { IInfblockGroupsRenderData } from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import { DocumentFieldDescriptionMode } from '../../../model/offer-document-settings.type';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { infoblocksStyles } from './infoblocks.styles';
import { TableGroup } from './TableGroup';
import { TableRows } from './TableRows';

export interface TableViewProps {
    groups: IInfblockGroupsRenderData[];
    mode: DocumentFieldDescriptionMode;
    theme: OfferPdfTheme;
    /** Шапки групп в таблице */
    withGroups: boolean;
}

/**
 * Наполнение таблицей. Группы — фрагменты, все строки — соседи в одной
 * таблице: метки разрыва (SplitGate) работают только среди соседей.
 */
export const TableView: FC<TableViewProps> = ({
    groups,
    mode,
    theme,
    withGroups,
}) => (
    <View style={infoblocksStyles(theme).table}>
        {withGroups ? (
            groups.map(group => (
                <TableGroup
                    key={group.groupsName}
                    group={group}
                    mode={mode}
                    theme={theme}
                />
            ))
        ) : (
            <TableRows
                items={groups.flatMap(group => group.infoblocks)}
                mode={mode}
                theme={theme}
            />
        )}
    </View>
);
