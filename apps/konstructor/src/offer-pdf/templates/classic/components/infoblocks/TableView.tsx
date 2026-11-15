import type { FC } from 'react';
import { View } from '@react-pdf/renderer';
import { IInfblockGroupsRenderData } from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import { DocumentFieldDescriptionMode } from '../../../../model/offer-document-settings.type';
import { infoblocksStyles as styles } from './infoblocks.styles';
import { TableGroup } from './TableGroup';
import { TableRows } from './TableRows';

export interface TableViewProps {
    groups: IInfblockGroupsRenderData[];
    mode: DocumentFieldDescriptionMode;
    /** Шапки групп в таблице */
    withGroups: boolean;
}

/**
 * Наполнение таблицей. Группы — фрагменты, все строки — соседи в одной
 * таблице: метки разрыва (SplitGate) работают только среди соседей.
 */
export const TableView: FC<TableViewProps> = ({ groups, mode, withGroups }) => (
    <View style={styles.table}>
        {withGroups ? (
            groups.map(group => (
                <TableGroup key={group.groupsName} group={group} mode={mode} />
            ))
        ) : (
            <TableRows
                items={groups.flatMap(group => group.infoblocks)}
                mode={mode}
            />
        )}
    </View>
);
