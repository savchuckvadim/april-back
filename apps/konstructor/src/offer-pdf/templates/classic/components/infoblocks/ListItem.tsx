import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { IInfblockRenderData } from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import { DocumentFieldDescriptionMode } from '../../../../model/offer-document-settings.type';
import { sx } from '../../../shared/style.util';
import { classicStyles } from '../../classic.styles';
import {
    isLongDescription,
    pickInfoblockDescription,
} from './infoblock-description.util';
import {
    LIST_DESC_CHARS,
    MIN_SPLIT_LINES,
    SPLIT_PRESENCE,
} from './infoblocks.layout';
import { infoblocksStyles as styles } from './infoblocks.styles';
import { SplitGate } from './SplitGate';

export interface ListItemProps {
    infoblock: IInfblockRenderData;
    mode: DocumentFieldDescriptionMode;
    /** Своя метка разрыва; у первого пункта группы её ставит заголовок */
    gate?: boolean;
}

/** Пункт списка: название и описание; длинный режется по странице. */
export const ListItem: FC<ListItemProps> = ({
    infoblock,
    mode,
    gate = true,
}) => {
    const description = pickInfoblockDescription(infoblock, mode);
    const long = isLongDescription(description, LIST_DESC_CHARS);

    return (
        <>
            {long && gate ? <SplitGate presence={SPLIT_PRESENCE} /> : null}
            <View style={styles.item} wrap={long}>
                <Text
                    style={sx(
                        styles.itemName,
                        Boolean(description) && classicStyles.bold,
                    )}
                >
                    {infoblock.name}
                </Text>
                {description ? (
                    <Text
                        style={styles.itemDesc}
                        orphans={MIN_SPLIT_LINES}
                        widows={MIN_SPLIT_LINES}
                    >
                        {description}
                    </Text>
                ) : null}
            </View>
        </>
    );
};
