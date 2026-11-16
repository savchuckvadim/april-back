import type { FC, ReactNode } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { OfferPdfChromeProps } from '../document/offer-pdf-chrome';
import { managerOf } from '../lib/manager.util';
import { joinNonEmpty } from '../lib/text.util';
import { managerFooterStyles } from './manager-footer.styles';

export interface ManagerFooterProps extends OfferPdfChromeProps {
    /** Черта над подвалом: по умолчанию — линия акцента; стиль может дать свою (градиент) */
    line?: ReactNode;
}

/**
 * Подвал листа: черта и менеджер одной строкой; номер страницы — справа
 * (kit). Черту рамкой и цвет имени стиль задаёт в теме (theme.footer).
 */
export const ManagerFooter: FC<ManagerFooterProps> = ({
    model,
    theme,
    line,
}) => {
    const styles = managerFooterStyles(theme);
    const manager = managerOf(model);
    const contacts = manager
        ? joinNonEmpty([manager.phone, manager.email], ' · ')
        : '';
    return (
        <View fixed style={styles.footer}>
            {line ??
                (theme.footer?.border ? null : <View style={styles.line} />)}
            {manager ? (
                <Text style={styles.manager}>
                    <Text style={styles.name}>{manager.name}</Text>
                    {contacts ? ` · ${contacts}` : ''}
                </Text>
            ) : null}
        </View>
    );
};
