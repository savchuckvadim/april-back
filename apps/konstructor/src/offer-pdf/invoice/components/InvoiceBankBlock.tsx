import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { OfferPdfTheme } from '../../templates/kit/theme/offer-pdf-theme';
import type { InvoicePdfModel } from '../model/invoice-pdf.model';
import { InvoiceAccountRow } from './InvoiceAccountRow';
import { InvoiceQr } from './InvoiceQr';
import { invoiceStyles } from './invoice-pdf.styles';

export interface InvoiceBankBlockProps {
    model: InvoicePdfModel;
    theme: OfferPdfTheme;
}

/**
 * Банковская шапка счёта: банк получателя, БИК и счета, ИНН и КПП, получатель.
 * Справа QR для оплаты, когда у реквизитов он загружен. Форма та же, что у
 * легаси: банк слева и БИК с корсчётом справа, ниже ИНН, КПП, получатель
 * и расчётный счёт.
 */
export const InvoiceBankBlock: FC<InvoiceBankBlockProps> = ({
    model,
    theme,
}) => {
    const { data, images } = model;
    const styles = invoiceStyles(theme);
    const receiver = data.MyCompanyFullName || data.MyCompanyName;

    return (
        <View style={styles.bankRow} wrap={false}>
            <View style={styles.bankTable}>
                <View style={styles.band}>
                    <View style={[styles.cell, styles.bankCell]}>
                        <View>
                            <Text style={[styles.text, styles.bold]}>
                                {data.MyCompanyBank}
                            </Text>
                            {data.MyCompanyBankAddress ? (
                                <Text style={styles.text}>
                                    {data.MyCompanyBankAddress}
                                </Text>
                            ) : null}
                        </View>
                        <Text style={styles.caption}>Банк получателя</Text>
                    </View>
                    <View style={styles.accounts}>
                        <InvoiceAccountRow
                            label="БИК"
                            value={data.MyCompanyBik}
                            theme={theme}
                        />
                        <InvoiceAccountRow
                            label="Сч. №"
                            value={data.MyCompanyKs}
                            theme={theme}
                        />
                    </View>
                </View>
                <View style={styles.band}>
                    <View style={styles.column}>
                        <View style={styles.band}>
                            <View
                                style={[
                                    styles.cell,
                                    data.MyCompanyKPP
                                        ? styles.half
                                        : styles.cellGrow,
                                ]}
                            >
                                <Text style={styles.text}>
                                    {`ИНН ${data.MyCompanyINN}`}
                                </Text>
                            </View>
                            {data.MyCompanyKPP ? (
                                <View style={[styles.cell, styles.half]}>
                                    <Text style={styles.text}>
                                        {`КПП ${data.MyCompanyKPP}`}
                                    </Text>
                                </View>
                            ) : null}
                        </View>
                        <View style={[styles.cell, styles.cellGrow]}>
                            <Text style={styles.text}>{receiver}</Text>
                            <Text style={styles.caption}>Получатель</Text>
                        </View>
                    </View>
                    <View style={styles.accounts}>
                        <InvoiceAccountRow
                            label="Сч. №"
                            value={data.MyCompanyRs}
                            theme={theme}
                        />
                    </View>
                </View>
            </View>
            {images.qr ? <InvoiceQr image={images.qr} theme={theme} /> : null}
        </View>
    );
};
