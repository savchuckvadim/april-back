import type { FC, ReactNode } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { OfferPdfImage } from '../../../model/offer-pdf-document.model';
import { BrandLogo } from '../brand/BrandLogo';
import { SheetBackground } from '../decor/SheetBackground';
import type { OfferPdfChromeProps } from '../document/offer-pdf-chrome';
import {
    managerContactsLine,
    recipientInnLine,
} from '../lib/cover-details.util';
import { offerCoverContent } from '../lib/cover.util';
import type { BrandCoverStyles } from './brand-cover.styles';
import { CoverPerson } from './CoverPerson';

export interface BrandCoverProps extends OfferPdfChromeProps {
    /** Фон титульника из model.assets.images */
    background: OfferPdfImage | undefined;
    /** Расстановка — стили титульника стиля (brandCoverStyles) */
    styles: BrandCoverStyles;
    logoColor: string;
    /** Под поставкой: черта стиля (градиент и т. п.) */
    divider?: ReactNode;
}

/**
 * Титульник по образцу вордовских шаблонов на картинке-фоне: логотип
 * Гаранта и наша компания, комплект крупно и поставка, внизу — для кого
 * с ИНН и кто подготовил.
 */
export const BrandCover: FC<BrandCoverProps> = ({
    model,
    background,
    styles,
    logoColor,
    divider,
}) => {
    const cover = offerCoverContent(model);
    return (
        <>
            <SheetBackground image={background} />
            <View style={styles.top}>
                <BrandLogo
                    logo={model.assets?.logos.garant}
                    color={logoColor}
                    height={28}
                />
                {cover.company ? (
                    <Text style={styles.company}>{cover.company}</Text>
                ) : null}
            </View>
            <View style={styles.main}>
                <Text style={styles.kicker}>
                    Коммерческое предложение · {cover.date}
                </Text>
                {cover.product ? (
                    <Text style={styles.product}>{cover.product}</Text>
                ) : null}
                {cover.supply ? (
                    <Text style={styles.supply}>{cover.supply}</Text>
                ) : null}
                {divider}
            </View>
            <View style={styles.bottom}>
                {cover.recipient ? (
                    <CoverPerson
                        label="Подготовлено для"
                        value={cover.recipient}
                        detail={recipientInnLine(cover)}
                        styles={styles}
                    />
                ) : null}
                {cover.manager ? (
                    <CoverPerson
                        label="Подготовил"
                        value={cover.manager.name}
                        detail={managerContactsLine(cover)}
                        styles={styles}
                    />
                ) : null}
            </View>
        </>
    );
};
