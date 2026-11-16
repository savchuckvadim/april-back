import type { FC } from 'react';
import { Document, Page } from '@react-pdf/renderer';
import type { OfferPdfPageFrame } from '../../../lib/pdf-layout';
import { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';
import { baseStyles } from '../base.styles';
import { OfferLetter } from '../letter/OfferLetter';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { ChromePage } from './ChromePage';
import { offerDocumentPages, offerDocumentTitle } from './document.util';
import type { OfferPdfChrome } from './offer-pdf-chrome';
import { OfferSections } from './OfferSections';

export interface OfferPdfDocumentProps {
    model: OfferPdfDocumentModel;
    theme: OfferPdfTheme;
    chrome: OfferPdfChrome;
    /** Поля под измеренные шапку и подвал; без них — поля темы */
    frame?: OfferPdfPageFrame;
}

/**
 * КП любого стиля: титульник и промо-страница (если они есть у стиля и
 * включены), затем страницы с шапкой, подложкой, письмом, разделами и
 * подвалом. Стиль задаёт тему и своё оформление листа (chrome).
 */
export const OfferPdfDocument: FC<OfferPdfDocumentProps> = ({
    model,
    theme,
    chrome,
    frame,
}) => {
    const { data, settings } = model;
    const base = baseStyles(theme);
    const { Cover, Promo } = chrome;
    const pages = offerDocumentPages(settings, chrome);

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
                    chrome={chrome}
                    frame={frame}
                >
                    <Promo model={model} theme={theme} />
                </ChromePage>
            ) : null}
            <ChromePage
                model={model}
                theme={theme}
                chrome={chrome}
                frame={frame}
            >
                {pages.letterInPromo ? null : (
                    <OfferLetter model={model} theme={theme} />
                )}
                <OfferSections
                    model={model}
                    theme={theme}
                    withoutStamps={pages.letterInPromo}
                />
            </ChromePage>
        </Document>
    );
};
