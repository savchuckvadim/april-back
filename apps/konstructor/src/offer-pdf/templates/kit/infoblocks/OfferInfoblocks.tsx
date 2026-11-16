import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { DocumentFieldViewMode } from '../../../model/offer-document-settings.type';
import { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';
import { baseStyles } from '../base.styles';
import { onSurface } from '../document/surface.styles';
import { SurfaceGate } from '../document/SurfaceGate';
import { HEADING_PRESENCE } from '../document/section.layout';
import { SplitGate } from './SplitGate';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { groupsWithItems } from './infoblock-description.util';
import { infoblocksStyles } from './infoblocks.styles';
import { ListView } from './ListView';
import { TableView } from './TableView';

export interface OfferInfoblocksProps {
    model: OfferPdfDocumentModel;
    theme: OfferPdfTheme;
}

/** Информационное наполнение комплекта: список или таблица, описание по режиму. */
export const OfferInfoblocks: FC<OfferInfoblocksProps> = ({ model, theme }) => {
    const { data, settings } = model;
    const groups = groupsWithItems(data.infoblocksByGroups ?? []);
    if (groups.length === 0) return null;
    const base = baseStyles(theme);

    return (
        <>
            <SurfaceGate theme={theme} />
            <View style={onSurface(theme, base.section)}>
                {/* заголовок не остаётся последним на листе и не рвётся: minPresenceAhead на самом тексте react-pdf соблюдает не всегда, а разорванный заголовок оставлял внизу пустой узел */}
                <SplitGate presence={HEADING_PRESENCE} />
                <Text
                    style={base.h2}
                    wrap={false}
                    minPresenceAhead={HEADING_PRESENCE}
                >
                    Информационное наполнение
                </Text>
                {data.GeneralProductName ? (
                    <Text style={infoblocksStyles(theme).complectName}>
                        {data.GeneralProductName}
                    </Text>
                ) : null}
                {settings.viewMode === DocumentFieldViewMode.LIST ? (
                    <ListView
                        groups={groups}
                        mode={settings.descriptionMode}
                        theme={theme}
                    />
                ) : (
                    <TableView
                        groups={groups}
                        mode={settings.descriptionMode}
                        theme={theme}
                        withGroups={
                            settings.viewMode ===
                            DocumentFieldViewMode.TABLE_WITH_GROUP
                        }
                    />
                )}
            </View>
        </>
    );
};
