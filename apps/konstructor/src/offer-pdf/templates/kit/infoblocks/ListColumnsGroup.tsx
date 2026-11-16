import type { FC } from 'react';
import { Text } from '@react-pdf/renderer';
import { IInfblockGroupsRenderData } from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import { chunk } from '../lib/text.util';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { HeadWithFirst } from './HeadWithFirst';
import { LIST_GROUP_HEAD } from './infoblocks.layout';
import { infoblocksStyles } from './infoblocks.styles';
import { ListNamesRow } from './ListNamesRow';

export interface ListColumnsGroupProps {
    group: IInfblockGroupsRenderData;
    theme: OfferPdfTheme;
}

/**
 * Группа списком без описаний в две колонки (как во вордовских «Искре» и
 * «Модерне»): заголовок держится вместе с первой строкой названий.
 */
export const ListColumnsGroup: FC<ListColumnsGroupProps> = ({
    group,
    theme,
}) => {
    const [first = [], ...rest] = chunk(group.infoblocks, 2);
    return (
        <>
            <HeadWithFirst
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
