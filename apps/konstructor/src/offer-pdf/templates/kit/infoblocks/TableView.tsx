import type { FC } from 'react';
import { View } from '@react-pdf/renderer';
import { IInfblockGroupsRenderData } from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import { DocumentFieldDescriptionMode } from '../../../model/offer-document-settings.type';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import type { InfoblocksLead } from './infoblocks-lead';
import { infoblocksStyles } from './infoblocks.styles';
import { TableGroup } from './TableGroup';
import { TableRows } from './TableRows';

export interface TableViewProps {
    groups: IInfblockGroupsRenderData[];
    mode: DocumentFieldDescriptionMode;
    theme: OfferPdfTheme;
    /** Шапки групп в таблице */
    withGroups: boolean;
    /** Блок перед первой строкой таблицы (заголовок комплекта) */
    lead?: InfoblocksLead;
}

/**
 * Наполнение таблицей. Группы — фрагменты, все строки — соседи в одной
 * таблице: метки разрыва (SplitGate) работают только среди соседей. Блок
 * перед таблицей (`lead`) лежит в ней первым: отступ сверху у него свой.
 */
export const TableView: FC<TableViewProps> = ({
    groups,
    mode,
    theme,
    withGroups,
    lead,
}) => {
    const items = groups.flatMap(group => group.infoblocks);
    return (
        <View style={lead ? undefined : infoblocksStyles(theme).table}>
            {withGroups ? (
                groups.map((group, index) => (
                    <TableGroup
                        key={group.groupsName}
                        group={group}
                        mode={mode}
                        theme={theme}
                        lead={index === 0 ? lead : undefined}
                    />
                ))
            ) : lead ? (
                <TableGroup
                    group={{ groupsName: '', infoblocks: items }}
                    mode={mode}
                    theme={theme}
                    lead={lead}
                    withHead={false}
                />
            ) : (
                <TableRows items={items} mode={mode} theme={theme} />
            )}
        </View>
    );
};
