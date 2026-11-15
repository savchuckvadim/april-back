import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { DocumentFieldViewMode } from '../../../../model/offer-document-settings.type';
import { OfferPdfDocumentModel } from '../../../../model/offer-pdf-document.model';
import { classicStyles } from '../../classic.styles';
import { groupsWithItems } from './infoblock-description.util';
import { infoblocksStyles as styles } from './infoblocks.styles';
import { ListView } from './ListView';
import { TableView } from './TableView';

export interface ClassicInfoblocksProps {
    model: OfferPdfDocumentModel;
}

/** Информационное наполнение комплекта: список или таблица, описание по режиму. */
export const ClassicInfoblocks: FC<ClassicInfoblocksProps> = ({ model }) => {
    const { data, settings } = model;
    const groups = groupsWithItems(data.infoblocksByGroups ?? []);
    if (groups.length === 0) return null;

    return (
        <View style={classicStyles.section}>
            <Text style={classicStyles.h2} minPresenceAhead={80}>
                Информационное наполнение
            </Text>
            {data.GeneralProductName ? (
                <Text style={styles.complectName}>
                    {data.GeneralProductName}
                </Text>
            ) : null}
            {settings.viewMode === DocumentFieldViewMode.LIST ? (
                <ListView groups={groups} mode={settings.descriptionMode} />
            ) : (
                <TableView
                    groups={groups}
                    mode={settings.descriptionMode}
                    withGroups={
                        settings.viewMode ===
                        DocumentFieldViewMode.TABLE_WITH_GROUP
                    }
                />
            )}
        </View>
    );
};
