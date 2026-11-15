import type { FC } from 'react';
import { IInfblockGroupsRenderData } from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import { DocumentFieldDescriptionMode } from '../../../../model/offer-document-settings.type';
import { ListGroup } from './ListGroup';

export interface ListViewProps {
    groups: IInfblockGroupsRenderData[];
    mode: DocumentFieldDescriptionMode;
}

/** Наполнение списком: группы с заголовками, пункты с описанием по режиму. */
export const ListView: FC<ListViewProps> = ({ groups, mode }) => (
    <>
        {groups.map(group => (
            <ListGroup key={group.groupsName} group={group} mode={mode} />
        ))}
    </>
);
