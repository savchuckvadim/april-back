import type { FC } from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';
import { RichText } from '../../shared/RichText';
import {
    buildClassicAppeal,
    buildClassicLetterText,
} from '../classic-letter-default';
import { CLASSIC_THEME } from '../classic.theme';

const { colors, sizes } = CLASSIC_THEME;

const styles = StyleSheet.create({
    rqRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    rqLeft: { width: '40%' },
    rqRight: { width: '50%', alignItems: 'flex-end' },
    rqLine: { fontSize: sizes.sm, color: colors.muted },
    rqLineRight: {
        fontSize: sizes.sm,
        color: colors.muted,
        textAlign: 'right',
    },
    appeal: {
        fontSize: sizes.lg,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 8,
    },
    // Без переносов выключка по ширине даёт дыры между словами — левый край.
    text: { fontSize: sizes.lg, textAlign: 'left' },
});

/** Сопроводительное письмо: номер/дата, адресат, обращение, текст. */
export const ClassicLetter: FC<{ model: OfferPdfDocumentModel }> = ({
    model,
}) => {
    const { data, letter, meta } = model;
    const appeal = letter.appeal ?? buildClassicAppeal(data);
    const text = letter.text ?? buildClassicLetterText(data);
    const dateLine = meta.documentNumber
        ? `Исх. № ${meta.documentNumber} от ${meta.date}`
        : meta.date;
    const recipientLines = [
        data.RecipientPositionCase,
        data.RecipientCompanyName,
        data.RecipientInn ? `ИНН ${data.RecipientInn}` : '',
        data.RecipientNameCase,
    ]
        .map(line => line?.trim() ?? '')
        .filter(line => line.length > 0);

    return (
        <View>
            <View style={styles.rqRow}>
                <View style={styles.rqLeft}>
                    <Text style={styles.rqLine}>{dateLine}</Text>
                </View>
                <View style={styles.rqRight}>
                    {recipientLines.map((line, index) => (
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
                accentColor={colors.accent}
                dangerColor={colors.danger}
            />
        </View>
    );
};
