import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { offerCoverContent } from '../../kit/lib/cover.util';
import { joinNonEmpty } from '../../kit/lib/text.util';
import { monoCoverStyles } from './mono-cover.styles';
import { MonoArrow } from './MonoArrow';
import { MonoCoverPerson } from './MonoCoverPerson';
import { MonoPill } from './MonoPill';
import { MonoTab } from './MonoTab';

/**
 * Титульник «Монохрома» по образцу вордовских шаблонов: главное — комплект
 * крупно и поставка («Модерн»), под ними — для кого с ИНН («Искра»); вверху
 * компания в таблетке со стрелкой и дата, внизу за чертой — кто подготовил.
 * Справа — вкладка.
 */
export const MonoCover: FC<OfferPdfChromeProps> = ({ model, theme }) => {
    const styles = monoCoverStyles(theme);
    const cover = offerCoverContent(model);
    const inn = cover.recipientInn ? `ИНН ${cover.recipientInn}` : '';
    const contacts = cover.manager
        ? joinNonEmpty([cover.manager.phone, cover.manager.email], ' · ')
        : '';

    return (
        <>
            <MonoTab model={model} theme={theme} />
            <View style={styles.top}>
                <View style={styles.chips}>
                    {cover.company ? (
                        <MonoPill label={cover.company} theme={theme} />
                    ) : null}
                    <View style={styles.gap} />
                    <MonoArrow color={theme.colors.text} />
                </View>
                <Text style={styles.date}>{cover.date}</Text>
            </View>
            <View style={styles.main}>
                <Text style={styles.kicker}>Коммерческое предложение</Text>
                {cover.product ? (
                    <Text style={styles.product}>{cover.product}</Text>
                ) : null}
                {cover.supply ? (
                    <Text style={styles.supply}>{cover.supply}</Text>
                ) : null}
                {cover.recipient ? (
                    <View style={styles.recipient}>
                        <MonoCoverPerson
                            label="Подготовлено для"
                            value={cover.recipient}
                            detail={inn}
                            large
                            theme={theme}
                        />
                    </View>
                ) : null}
            </View>
            {cover.manager ? (
                <View style={styles.bottom}>
                    <View style={styles.rule} />
                    <View style={styles.bottomRow}>
                        <MonoCoverPerson
                            label="Подготовил"
                            value={cover.manager.name}
                            detail={contacts}
                            theme={theme}
                        />
                    </View>
                </View>
            ) : null}
        </>
    );
};
