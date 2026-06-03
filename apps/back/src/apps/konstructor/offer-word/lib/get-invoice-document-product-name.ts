import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';

export const getInvoiceDocumentProductName = (
    dto: OfferWordByTemplateGenerateDto,
    isAlternative: boolean,
    invoiceCount: number,
) => {
    try {
        let firstGeneralRow = dto.sets.general[0]?.rows.garant[0];

        if (isAlternative) {
            firstGeneralRow =
                dto.sets?.alternative[invoiceCount - 1]?.rows?.garant[0] ||
                `Cчет - ${invoiceCount}`;
        }
        const productName =
            firstGeneralRow.alternativeName || firstGeneralRow.name;
        const supplyName = firstGeneralRow.supply?.name || '';

        return `Cчет ${productName} - ${supplyName}`;
    } catch (error) {
        console.error('Error in getInvoiceDocumentProductName:', error);
        return !isAlternative ? 'Cчет' : `Cчет - ${invoiceCount}`;
    }
};
