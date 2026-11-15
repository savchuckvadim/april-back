import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { IInfblockRenderData } from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import { chunk } from '../lib/text.util';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { infoblocksStyles } from './infoblocks.styles';

export interface NamesRowsProps {
    items: IInfblockRenderData[];
    theme: OfferPdfTheme;
}

/** Таблица без описаний: названия в две колонки, строки неразрывные. */
export const NamesRows: FC<NamesRowsProps> = ({ items, theme }) => {
    const styles = infoblocksStyles(theme);
    return (
        <>
            {chunk(items, 2).map((pair, index) => (
                <View key={index} style={styles.tr} wrap={false}>
                    <View style={[styles.td, styles.tdHalf]}>
                        <Text style={styles.tdText}>{pair[0].name}</Text>
                    </View>
                    <View style={[styles.td, styles.tdHalf, styles.tdLast]}>
                        <Text style={styles.tdText}>{pair[1]?.name ?? ''}</Text>
                    </View>
                </View>
            ))}
        </>
    );
};
