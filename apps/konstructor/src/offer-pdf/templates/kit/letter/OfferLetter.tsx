import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';
import { RichText } from '../../shared/RichText';
import { surfaceOnly } from '../document/surface.styles';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { buildDefaultAppeal, buildDefaultLetterText } from './letter-default';
import { letterStyles } from './letter.styles';
import { letterDateLine, recipientLines } from './letter.util';

export interface OfferLetterProps {
    model: OfferPdfDocumentModel;
    theme: OfferPdfTheme;
}

/** Сопроводительное письмо: номер/дата, адресат, обращение, текст. */
export const OfferLetter: FC<OfferLetterProps> = ({ model, theme }) => {
    const { data, letter, meta } = model;
    const styles = letterStyles(theme);
    const appeal = letter.appeal ?? buildDefaultAppeal(data);
    const text = letter.text ?? buildDefaultLetterText(data);

    return (
        <View style={surfaceOnly(theme)}>
            <View style={styles.rqRow}>
                <View style={styles.rqLeft}>
                    <Text style={styles.rqLine}>{letterDateLine(meta)}</Text>
                </View>
                <View style={styles.rqRight}>
                    {recipientLines(data).map((line, index) => (
                        <Text key={index} style={styles.rqLineRight}>
                            {line}
                        </Text>
                    ))}
                </View>
            </View>
            {appeal ? <Text style={styles.appeal}>{appeal}</Text> : null}
            <RichText
                text={text}
                style={styles.text}
                accentColor={theme.colors.accent}
                dangerColor={theme.colors.danger}
            />
        </View>
    );
};
