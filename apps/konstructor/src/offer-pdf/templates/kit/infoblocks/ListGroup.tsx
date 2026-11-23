import type { FC } from 'react';
import { Text } from '@react-pdf/renderer';
import { IInfblockGroupsRenderData } from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import { DocumentFieldDescriptionMode } from '../../../model/offer-document-settings.type';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { HeadWithFirst } from './HeadWithFirst';
import { isLongInfoblock } from './infoblock-description.util';
import { LIST_DESC_CHARS, LIST_GROUP_HEAD } from './infoblocks.layout';
import type { InfoblocksLead } from './infoblocks-lead';
import { infoblocksStyles } from './infoblocks.styles';
import { ListItem } from './ListItem';

export interface ListGroupProps {
    group: IInfblockGroupsRenderData;
    mode: DocumentFieldDescriptionMode;
    theme: OfferPdfTheme;
    /** Блок перед заголовком группы: у первой группы раздела комплекта */
    lead?: InfoblocksLead;
}

/** Группа в виде списка: заголовок вместе с первым пунктом, затем остальные. */
export const ListGroup: FC<ListGroupProps> = ({ group, mode, theme, lead }) => {
    const [first, ...rest] = group.infoblocks;

    return (
        <>
            <HeadWithFirst
                lead={lead}
                head={
                    <Text style={infoblocksStyles(theme).groupTitle}>
                        {group.groupsName}
                    </Text>
                }
                first={
                    <ListItem
                        infoblock={first}
                        mode={mode}
                        theme={theme}
                        gate={false}
                    />
                }
                firstLong={isLongInfoblock(first, mode, LIST_DESC_CHARS)}
                headHeight={LIST_GROUP_HEAD}
            />
            {rest.map((infoblock, index) => (
                <ListItem
                    key={index}
                    infoblock={infoblock}
                    mode={mode}
                    theme={theme}
                />
            ))}
        </>
    );
};
