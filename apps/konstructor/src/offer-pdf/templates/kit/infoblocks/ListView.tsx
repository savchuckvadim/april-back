import type { FC } from 'react';
import { IInfblockGroupsRenderData } from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import { DocumentFieldDescriptionMode } from '../../../model/offer-document-settings.type';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import type { InfoblocksLead } from './infoblocks-lead';
import { ListColumnsGroup } from './ListColumnsGroup';
import { ListGroup } from './ListGroup';

export interface ListViewProps {
    groups: IInfblockGroupsRenderData[];
    mode: DocumentFieldDescriptionMode;
    theme: OfferPdfTheme;
    /** Блок перед первой группой (заголовок комплекта) */
    lead?: InfoblocksLead;
}

/**
 * Наполнение списком: группы с заголовками, пункты с описанием по режиму.
 * Без описаний у стиля с двумя колонками названия идут парами.
 */
export const ListView: FC<ListViewProps> = ({ groups, mode, theme, lead }) => {
    const columns =
        theme.infoblocks?.namesColumns === 2 &&
        mode === DocumentFieldDescriptionMode.NO;
    return (
        <>
            {groups.map((group, index) =>
                columns ? (
                    <ListColumnsGroup
                        key={group.groupsName}
                        group={group}
                        theme={theme}
                        lead={index === 0 ? lead : undefined}
                    />
                ) : (
                    <ListGroup
                        key={group.groupsName}
                        group={group}
                        mode={mode}
                        theme={theme}
                        lead={index === 0 ? lead : undefined}
                    />
                ),
            )}
        </>
    );
};
