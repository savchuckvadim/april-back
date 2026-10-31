import type { FC } from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';
import { CLASSIC_THEME } from '../classic.theme';

const { colors, sizes, page } = CLASSIC_THEME;

const styles = StyleSheet.create({
    footer: {
        position: 'absolute',
        bottom: page.edge,
        left: page.paddingHorizontal,
        right: page.paddingHorizontal,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        borderTopWidth: 0.5,
        borderTopColor: colors.line,
        paddingTop: 6,
    },
    managerLine: { fontSize: sizes.xs, color: colors.muted },
    managerName: {
        fontSize: sizes.sm,
        fontWeight: 'bold',
        color: colors.text,
    },
    pageNumber: { fontSize: sizes.xs, color: colors.muted },
});

/** Подвал на каждой странице: контакты менеджера (по настройке) и номер страницы. */
export const ClassicFooter: FC<{ model: OfferPdfDocumentModel }> = ({
    model,
}) => {
    const { data, settings } = model;
    const managerName = data.ManagerName?.trim() ?? '';
    const showManager = settings.withManager && managerName.length > 0;

    return (
        <View fixed style={styles.footer}>
            <View>
                {showManager ? (
                    <>
                        <Text style={styles.managerLine}>
                            {data.ManagerPosition?.trim() ||
                                'Ваш персональный менеджер'}
                        </Text>
                        <Text style={styles.managerName}>{managerName}</Text>
                        {data.ManagerEmail ? (
                            <Text style={styles.managerLine}>
                                e-mail: {data.ManagerEmail}
                            </Text>
                        ) : null}
                        {data.ManagerPhone ? (
                            <Text style={styles.managerLine}>
                                телефон: {data.ManagerPhone}
                            </Text>
                        ) : null}
                    </>
                ) : null}
            </View>
            <Text
                style={styles.pageNumber}
                render={({ pageNumber, totalPages }) =>
                    `${pageNumber} / ${totalPages}`
                }
            />
        </View>
    );
};
