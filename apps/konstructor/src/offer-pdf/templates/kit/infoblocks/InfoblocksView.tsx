import type { FC } from 'react';
import { IInfblockGroupsRenderData } from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import { DocumentFieldViewMode } from '../../../model/offer-document-settings.type';
import type { OfferPdfSettings } from '../../../model/offer-pdf-settings';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import type { InfoblocksLead } from './infoblocks-lead';
import { ListView } from './ListView';
import { TableView } from './TableView';

export interface InfoblocksViewProps {
    groups: IInfblockGroupsRenderData[];
    settings: Pick<OfferPdfSettings, 'descriptionMode' | 'viewMode'>;
    theme: OfferPdfTheme;
    /** Блок перед первой группой (заголовок комплекта) */
    lead?: InfoblocksLead;
}

/** Группы наполнения в виде, который выбран настройками: список, таблица, таблица с разделами. */
export const InfoblocksView: FC<InfoblocksViewProps> = ({
    groups,
    settings,
    theme,
    lead,
}) =>
    settings.viewMode === DocumentFieldViewMode.LIST ? (
        <ListView
            groups={groups}
            mode={settings.descriptionMode}
            theme={theme}
            lead={lead}
        />
    ) : (
        <TableView
            groups={groups}
            mode={settings.descriptionMode}
            theme={theme}
            withGroups={
                settings.viewMode === DocumentFieldViewMode.TABLE_WITH_GROUP
            }
            lead={lead}
        />
    );
