import type { FC } from 'react';
import { Image, Text, View } from '@react-pdf/renderer';
import { GlassStripes } from '../../kit/decor/GlassStripes';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { joinNonEmpty } from '../../kit/lib/text.util';
import { offerCoverContent } from '../../kit/lib/cover.util';
import { A4 } from '../../kit/theme/offer-pdf-theme';
import { MODERN_STRIPE_BASE } from '../modern.theme';
import { COVER_STRIPES_WIDTH, modernCoverStyles } from './modern-cover.styles';
import { ModernContact } from './ModernContact';

/**
 * Титульник «Современного»: бренд, крупное «Коммерческое предложение»,
 * акцентная черта, комплект и поставка; внизу — для кого и кто подготовил.
 * Справа во всю высоту — полосы «рифлёного стекла».
 */
export const ModernCover: FC<OfferPdfChromeProps> = ({ model, theme }) => {
    const styles = modernCoverStyles(theme);
    const cover = offerCoverContent(model);
    const details = joinNonEmpty([cover.supply, cover.date], ' · ');

    return (
        <>
            <View style={styles.stripes}>
                <GlassStripes
                    id="cover"
                    width={COVER_STRIPES_WIDTH}
                    height={A4.height}
                    accent={theme.colors.accent}
                    base={MODERN_STRIPE_BASE}
                    count={14}
                    intensity={1}
                />
            </View>
            <View style={styles.top}>
                <View style={styles.brandRow}>
                    {model.images.logo ? (
                        <Image style={styles.logo} src={model.images.logo} />
                    ) : (
                        <View style={styles.brandMark} />
                    )}
                    {cover.company ? (
                        <Text style={styles.company}>{cover.company}</Text>
                    ) : null}
                </View>
                <Text style={styles.title}>{'КОММЕРЧЕСКОЕ\nПРЕДЛОЖЕНИЕ'}</Text>
                <View style={styles.bar} />
                {cover.product ? (
                    <Text style={styles.product}>{cover.product}</Text>
                ) : null}
                {details ? <Text style={styles.details}>{details}</Text> : null}
            </View>
            <View style={styles.bottom}>
                {cover.recipient ? (
                    <View style={styles.block}>
                        <Text style={styles.label}>Подготовлено для</Text>
                        <Text style={styles.value}>{cover.recipient}</Text>
                    </View>
                ) : null}
                {cover.manager ? (
                    <View style={styles.block}>
                        <Text style={styles.label}>Подготовил</Text>
                        <Text style={styles.value}>{cover.manager.name}</Text>
                        {cover.manager.phone ? (
                            <ModernContact
                                value={cover.manager.phone}
                                theme={theme}
                            />
                        ) : null}
                        {cover.manager.email ? (
                            <ModernContact
                                value={cover.manager.email}
                                theme={theme}
                            />
                        ) : null}
                    </View>
                ) : null}
            </View>
        </>
    );
};
