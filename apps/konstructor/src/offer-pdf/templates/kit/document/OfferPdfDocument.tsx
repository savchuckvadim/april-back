import type { FC } from 'react';
import { Document, Page } from '@react-pdf/renderer';
import type { OfferPdfPageFrame } from '../../../lib/pdf-layout';
import { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';
import { baseStyles } from '../base.styles';
import { groupsWithItems } from '../infoblocks/infoblock-description.util';
import { OfferLetter } from '../letter/OfferLetter';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { ChromePage } from './ChromePage';
import {
    offerDocumentPages,
    offerDocumentTitle,
    offerSheetFlows,
    type OfferSheetFlow,
} from './document.util';
import type { OfferPdfChrome } from './offer-pdf-chrome';
import { OfferSections } from './OfferSections';
import { priceFitsLetterSheet, priceStartsOwnSheet } from './sheet-fit.util';
import { withSurfaceBottom } from './surface.styles';

export interface OfferPdfDocumentProps {
    model: OfferPdfDocumentModel;
    theme: OfferPdfTheme;
    chrome: OfferPdfChrome;
    /** Поля под измеренные шапку и подвал; без них — поля темы */
    frame?: OfferPdfPageFrame;
}

/**
 * КП любого стиля: титульник и промо-страница (если они есть у стиля и
 * включены), затем потоки листов с шапкой, подложкой и подвалом: письмо с
 * подписью, цена, наполнение. Стиль задаёт тему и своё оформление листа
 * (chrome); что стоит на одном листе, решает offerSheetFlows.
 */
export const OfferPdfDocument: FC<OfferPdfDocumentProps> = ({
    model,
    theme,
    chrome,
    frame,
}) => {
    const { data, settings } = model;
    const base = baseStyles(theme);
    // карточки писем и разделов: нижнее поле меняется только перерисовкой
    const cardTheme = withSurfaceBottom(theme, frame?.surfaceBottom);
    const { Cover, Promo } = chrome;
    const pages = offerDocumentPages(settings, chrome);
    const letterOnSheets = !pages.letterInPromo;
    const hasInfoblocks =
        groupsWithItems(data.infoblocksByGroups ?? []).length > 0;
    // поток из одного наполнения, которого нет, — пустой лист не печатаем
    const isPrintable = (flow: OfferSheetFlow): boolean =>
        flow.withLetter ||
        flow.keys.some(key => key !== 'infoblocks' || hasInfoblocks);
    const flows = offerSheetFlows(settings, {
        letterOnSheets,
        priceFitsLetter:
            letterOnSheets &&
            settings.isPriceFirst &&
            priceFitsLetterSheet(model, theme),
        priceStartsSheet: priceStartsOwnSheet(model, theme),
    }).filter(isPrintable);

    return (
        <Document
            title={offerDocumentTitle(data)}
            author={data.MyCompanyName || undefined}
            creator="April Konstructor"
            producer="April Konstructor"
            language="ru"
        >
            {Cover && pages.withCover ? (
                <Page size="A4" style={base.coverPage}>
                    <Cover model={model} theme={theme} />
                </Page>
            ) : null}
            {Promo && pages.withPromo ? (
                <ChromePage
                    model={model}
                    theme={theme}
                    chrome={
                        chrome.PromoUnderlay
                            ? { ...chrome, Underlay: chrome.PromoUnderlay }
                            : chrome
                    }
                    frame={frame}
                >
                    <Promo model={model} theme={cardTheme} />
                </ChromePage>
            ) : null}
            {flows.map((flow, index) => (
                <ChromePage
                    key={index}
                    model={model}
                    theme={theme}
                    chrome={chrome}
                    frame={frame}
                >
                    {flow.withLetter ? (
                        <OfferLetter model={model} theme={cardTheme} />
                    ) : null}
                    <OfferSections
                        model={model}
                        theme={cardTheme}
                        keys={flow.keys}
                    />
                </ChromePage>
            ))}
        </Document>
    );
};
