import type { FC, ReactNode } from 'react';
import { Page, View } from '@react-pdf/renderer';
import type { OfferPdfPageFrame } from '../../../lib/pdf-layout';
import { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';
import { baseStyles } from '../base.styles';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import type { OfferPdfChrome } from './offer-pdf-chrome';
import { PageNumber } from './PageNumber';

export interface ChromePageProps {
    model: OfferPdfDocumentModel;
    theme: OfferPdfTheme;
    chrome: OfferPdfChrome;
    /** Поля под измеренные шапку и подвал; без них — поля темы */
    frame?: OfferPdfPageFrame;
    children: ReactNode;
}

/** Лист стиля: подложка, шапка, содержимое, подвал и номер страницы */
export const ChromePage: FC<ChromePageProps> = ({
    model,
    theme,
    chrome,
    frame,
    children,
}) => {
    const base = baseStyles(theme);
    const { Header, Footer, Underlay } = chrome;
    return (
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
            <View style={base.content}>{children}</View>
            <Footer model={model} theme={theme} />
            <PageNumber theme={theme} />
        </Page>
    );
};
