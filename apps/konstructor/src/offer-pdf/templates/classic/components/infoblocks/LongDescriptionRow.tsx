import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { InfoblockName } from './InfoblockName';
import { MIN_SPLIT_LINES, SPLIT_PRESENCE } from './infoblocks.layout';
import { infoblocksStyles as styles } from './infoblocks.styles';
import { SplitGate } from './SplitGate';

export interface LongDescriptionRowProps {
    name: string;
    description: string;
    /** Своя метка разрыва; у первой строки группы её ставит шапка */
    gate: boolean;
}

/**
 * Длинная строка режется по странице, по обе стороны разрыва не меньше
 * MIN_SPLIT_LINES строк. Колонка описания задана отступом строки, название —
 * абсолютом: продолжение на новом листе движок раскладывает заново, и ячейка
 * без соседки-названия уехала бы в левую колонку.
 */
export const LongDescriptionRow: FC<LongDescriptionRowProps> = ({
    name,
    description,
    gate,
}) => (
    <>
        {gate ? <SplitGate presence={SPLIT_PRESENCE} /> : null}
        <View style={styles.trLong}>
            <View style={styles.tdNameAbsolute}>
                <InfoblockName name={name} />
            </View>
            <View style={styles.tdDescLong}>
                <Text
                    style={styles.tdDescText}
                    orphans={MIN_SPLIT_LINES}
                    widows={MIN_SPLIT_LINES}
                >
                    {description}
                </Text>
            </View>
        </View>
    </>
);
