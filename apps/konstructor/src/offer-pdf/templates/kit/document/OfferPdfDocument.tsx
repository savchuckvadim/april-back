import type { FC } from 'react';
import { Document, Page, View } from '@react-pdf/renderer';
import type { OfferPdfPageFrame } from '../../../lib/pdf-layout';
import { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';
import { baseStyles } from '../base.styles';
import { OfferLetter } from '../letter/OfferLetter';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { offerDocumentTitle } from './document.util';
import type { OfferPdfChrome } from './offer-pdf-chrome';
import { OfferSections } from './OfferSections';
import { PageNumber } from './PageNumber';

export interface OfferPdfDocumentProps {
    model: OfferPdfDocumentModel;
    theme: OfferPdfTheme;
    chrome: OfferPdfChrome;
    /** Поля под измеренные шапку и подвал; без них — поля темы */
    frame?: OfferPdfPageFrame;
}

/**
 * КП любого стиля: титульник (если он есть у стиля и включён), затем
 * страницы с шапкой, подложкой, письмом, разделами и подвалом. Стиль задаёт
 * тему и своё оформление листа (chrome).
 */
export const OfferPdfDocument: FC<OfferPdfDocumentProps> = ({
    model,
    theme,
    chrome,
    frame,
}) => {
    const { data, settings } = model;
    const base = baseStyles(theme);
    const { Header, Footer, Cover, Underlay } = chrome;

    return (
        <Document
            title={offerDocumentTitle(data)}
            author={data.MyCompanyName || undefined}
            creator="April Konstructor"
            producer="April Konstructor"
            language="ru"
        >
            {Cover && settings.withCover ? (
                <Page size="A4" style={base.coverPage}>
                    <Cover model={model} theme={theme} />
                </Page>
            ) : null}
            <Page
                size="A4"
                style={
                    frame
                        ? [
                              base.page,
                              {
                                  paddingTop: frame.paddingTop,
                                  paddingBottom: frame.paddingBottom,
                              },
                          ]
                        : base.page
                }
            >
                {Underlay ? <Underlay model={model} theme={theme} /> : null}
                <Header model={model} theme={theme} />
                <View style={base.content}>
                    <OfferLetter model={model} theme={theme} />
                    <OfferSections model={model} theme={theme} />
                </View>
                <Footer model={model} theme={theme} />
                <PageNumber theme={theme} />
            </Page>
        </Document>
    );
};
