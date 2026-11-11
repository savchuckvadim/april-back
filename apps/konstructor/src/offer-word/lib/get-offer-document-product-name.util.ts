import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';

/** Название файла КП по главной строке. Нужны только sets — чтобы PDF-поток звал с тем же запросом. */
export const getOfferDocumentProductName = (
    dto: Pick<OfferWordByTemplateGenerateDto, 'sets'>,
) => {
    try {
        // любой тип строк в сете может отсутствовать (ProductRowSetItemDto)
        const firstGeneralRow = dto.sets.general[0]?.rows?.garant?.[0];
        // без строки Гаранта имя выходило «КП undefined - »
        if (!firstGeneralRow) {
            return 'КП';
        }

        const productName =
            firstGeneralRow?.alternativeName || firstGeneralRow?.name;
        const supplyName = firstGeneralRow?.supply?.name || '';
        // const contractName =
        //     firstGeneralRow?.product?.contract?.aprilName || '';
        return `КП ${productName} - ${supplyName}`;
    } catch (error) {
        console.error('Error in getOfferDocumentProductName:', error);
        return 'КП';
    }
};
