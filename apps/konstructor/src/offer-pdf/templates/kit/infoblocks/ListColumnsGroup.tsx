import type { FC } from 'react';
import { Text } from '@react-pdf/renderer';
import { IInfblockGroupsRenderData } from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import { chunk } from '../lib/text.util';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { HeadWithFirst } from './HeadWithFirst';
import { LIST_GROUP_HEAD } from './infoblocks.layout';
import type { InfoblocksLead } from './infoblocks-lead';
import { infoblocksStyles } from './infoblocks.styles';
import { ListNamesRow } from './ListNamesRow';

export interface ListColumnsGroupProps {
    group: IInfblockGroupsRenderData;
    theme: OfferPdfTheme;
    /** Блок перед заголовком группы: у первой группы раздела комплекта */
    lead?: InfoblocksLead;
}

/**
 * Группа списком без описаний в две колонки (как во вордовских «Искре» и
 * «Модерне»): заголовок держится вместе с первой строкой названий.
 */
export const ListColumnsGroup: FC<ListColumnsGroupProps> = ({
    group,
    theme,
    lead,
}) => {
    const [first = [], ...rest] = chunk(group.infoblocks, 2);
    return (
        <>
            <HeadWithFirst
                lead={lead}
                head={
                    <Text style={infoblocksStyles(theme).groupTitle}>
                        {group.groupsName}
                    </Text>
                }
                first={<ListNamesRow pair={first} theme={theme} />}
                firstLong={false}
                headHeight={LIST_GROUP_HEAD}
            />
            {rest.map(pair => (
                <ListNamesRow
                    key={pair.map(infoblock => infoblock.name).join('|')}
                    pair={pair}
                    theme={theme}
                />
            ))}
        </>
    );
};
