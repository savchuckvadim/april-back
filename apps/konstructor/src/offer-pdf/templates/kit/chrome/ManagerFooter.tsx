import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { OfferPdfChromeProps } from '../document/offer-pdf-chrome';
import { managerOf } from '../lib/manager.util';
import { joinNonEmpty } from '../lib/text.util';
import { FooterLine } from './FooterLine';
import { managerFooterStyles } from './manager-footer.styles';

/**
 * Подвал листа: черта и менеджер одной строкой; номер страницы — справа
 * (kit). Вид черты и цвет имени стиль задаёт в теме (theme.footer,
 * theme.colors.gradient).
 */
export const ManagerFooter: FC<OfferPdfChromeProps> = ({ model, theme }) => {
    const styles = managerFooterStyles(theme);
    const manager = managerOf(model);
    const contacts = manager
        ? joinNonEmpty([manager.phone, manager.email], ' · ')
        : '';
    return (
        <View fixed style={styles.footer}>
            <FooterLine theme={theme} />
            {manager ? (
                <Text style={styles.manager}>
                    <Text style={styles.name}>{manager.name}</Text>
                    {contacts ? ` · ${contacts}` : ''}
                </Text>
            ) : null}
        </View>
    );
};
