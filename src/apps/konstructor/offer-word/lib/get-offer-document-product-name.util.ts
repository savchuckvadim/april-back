import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';

export const getOfferDocumentProductName = (
    dto: OfferWordByTemplateGenerateDto,
) => {
    try {
        const firstGeneralRow = dto.sets.general[0]?.rows.garant[0];

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
