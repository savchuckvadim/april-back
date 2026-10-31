import type { FC } from 'react';
import { Document, Page } from '@react-pdf/renderer';
import { OfferPdfDocumentModel } from '../../model/offer-pdf-document.model';
import { OfferPdfTemplateCode } from '../../model/offer-pdf-template-code';
import { OfferPdfTemplate } from '../offer-pdf-template.interface';
import { classicStyles } from './classic.styles';
import { ClassicFooter } from './components/ClassicFooter';
import { ClassicHeader } from './components/ClassicHeader';
import { ClassicInfoblocks } from './components/ClassicInfoblocks';
import { ClassicLetter } from './components/ClassicLetter';
import { ClassicPrice } from './components/ClassicPrice';
import { ClassicStamps } from './components/ClassicStamps';

/**
 * Классический КП — перенос старого Blade-шаблона: письмо, цена,
 * наполнение, подпись/печать, менеджер в подвале. Порядок «цена ↔
 * наполнение» и наличие блоков — из настроек модели.
 */
const ClassicDocument: FC<{ model: OfferPdfDocumentModel }> = ({ model }) => {
    const { settings, data } = model;
    const price = <ClassicPrice key="price" model={model} />;
    const infoblocks = <ClassicInfoblocks key="infoblocks" model={model} />;
    // Подпись руководителя — под письмом, как в старой версии; при «сначала
    // цена» — сразу после цены. В конце документа она оставалась одна на
    // пустой странице.
    const stamps = settings.withStamps ? (
        <ClassicStamps key="stamps" model={model} />
    ) : null;
    const sections = settings.isPriceFirst
        ? [price, stamps, infoblocks]
        : [stamps, infoblocks, price];
    const title = data.GeneralProductName
        ? `Коммерческое предложение — ${data.GeneralProductName}`
        : 'Коммерческое предложение';

    return (
        <Document
            title={title}
            author={data.MyCompanyName || undefined}
            creator="April Konstructor"
            producer="April Konstructor"
            language="ru"
        >
            <Page size="A4" style={classicStyles.page}>
                <ClassicHeader model={model} />
                <ClassicLetter model={model} />
                {sections}
                <ClassicFooter model={model} />
            </Page>
        </Document>
    );
};

export const classicTemplate: OfferPdfTemplate = {
    code: OfferPdfTemplateCode.CLASSIC,
    name: 'Классический',
    description:
        'Как в прежней версии: письмо, таблица цен, наполнение списком или таблицей, подпись и печать, контакты менеджера.',
    render: model => <ClassicDocument model={model} />,
};
