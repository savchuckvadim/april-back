import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';

export const getInvoiceDocumentProductName = (
    dto: OfferWordByTemplateGenerateDto,
    isAlternative: boolean,
    invoiceCount: number,
) => {
    const fallbackName = !isAlternative ? 'Cчет' : `Cчет - ${invoiceCount}`;
    try {
        // любой тип строк в сете может отсутствовать (ProductRowSetItemDto)
        const firstRow = isAlternative
            ? dto.sets?.alternative[invoiceCount - 1]?.rows?.garant?.[0]
            : dto.sets.general[0]?.rows?.garant?.[0];
        // Раньше для альтернативы без строки Гаранта сюда подставлялась
        // строка `Cчет - N`, и имя выходило «Cчет undefined - »
        if (!firstRow) {
            return fallbackName;
        }
        const productName = firstRow.alternativeName || firstRow.name;
        const supplyName = firstRow.supply?.name || '';

        return `Cчет ${productName} - ${supplyName}`;
    } catch (error) {
        console.error('Error in getInvoiceDocumentProductName:', error);
        return fallbackName;
    }
};
