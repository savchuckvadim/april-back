import type { FC } from 'react';
import { IInfblockGroupsRenderData } from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import { DocumentFieldDescriptionMode } from '../../../model/offer-document-settings.type';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { ListColumnsGroup } from './ListColumnsGroup';
import { ListGroup } from './ListGroup';

export interface ListViewProps {
    groups: IInfblockGroupsRenderData[];
    mode: DocumentFieldDescriptionMode;
    theme: OfferPdfTheme;
}

/**
 * Наполнение списком: группы с заголовками, пункты с описанием по режиму.
 * Без описаний у стиля с двумя колонками названия идут парами.
 */
export const ListView: FC<ListViewProps> = ({ groups, mode, theme }) => {
    const columns =
        theme.infoblocks?.namesColumns === 2 &&
        mode === DocumentFieldDescriptionMode.NO;
    return (
        <>
            {groups.map(group =>
                columns ? (
                    <ListColumnsGroup
                        key={group.groupsName}
                        group={group}
                        theme={theme}
                    />
                ) : (
                    <ListGroup
                        key={group.groupsName}
                        group={group}
                        mode={mode}
                        theme={theme}
                    />
                ),
            )}
        </>
    );
};
