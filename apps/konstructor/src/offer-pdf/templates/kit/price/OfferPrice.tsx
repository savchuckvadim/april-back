import type { FC } from 'react';
import { View } from '@react-pdf/renderer';
import { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';
import { baseStyles } from '../base.styles';
import { onSurface } from '../document/surface.styles';
import { SurfaceGate } from '../document/SurfaceGate';
import { HEADING_PRESENCE } from '../document/section.layout';
import {
    priceKeepsHeadingWithTable,
    priceStartPresence,
} from '../document/sheet-fit.util';
import { SplitGate } from '../infoblocks/SplitGate';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { PriceHeading } from './PriceHeading';
import { PriceTable } from './PriceTable';

export interface OfferPriceProps {
    model: OfferPdfDocumentModel;
    theme: OfferPdfTheme;
}

/**
 * Раздел «Стоимость»: заголовок, подпись, таблица цен, итог и фраза об
 * акции. Заголовок не остаётся на листе без таблицы. Короткая таблица идёт с
 * заголовком одним неделимым блоком. Длинная рвётся по строкам, а метка
 * перед карточкой держит место под заголовок, подпись, шапку и первую
 * строку. Метка стоит снаружи карточки: первый элемент внутри неё react-pdf
 * на следующий лист не переносит.
 */
export const OfferPrice: FC<OfferPriceProps> = ({ model, theme }) => {
    const base = baseStyles(theme);
    const { data } = model;
    const caption =
        data.GeneralProductByContractName || data.GeneralProductName;
    const keepWhole = priceKeepsHeadingWithTable(model, theme);
    const heading = <PriceHeading caption={caption} theme={theme} />;
    const table = <PriceTable model={model} theme={theme} />;

    return (
        <>
            <SurfaceGate theme={theme} />
            {keepWhole ? null : (
                <SplitGate presence={priceStartPresence(model, theme)} />
            )}
            <View style={onSurface(theme, base.section)}>
                {keepWhole ? (
                    <View wrap={false}>
                        {heading}
                        {table}
                    </View>
                ) : (
                    <>
                        {/* заголовок не рвётся и не остаётся последним на листе: метка даёт ему соседа слева, без него minPresenceAhead первого элемента не работает */}
                        <SplitGate presence={HEADING_PRESENCE} />
                        {heading}
                        {table}
                    </>
                )}
            </View>
        </>
    );
};
