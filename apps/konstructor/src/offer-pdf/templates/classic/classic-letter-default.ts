import { IOfferWordRenderData } from '@app/konstructor/offer-word/services/render-data-services/offer-render-data.service';

/**
 * Обращение по умолчанию. Старая версия писала «Уважаемый/Уважаемая …» и
 * определяла род по имени (morphos); здесь нейтральная форма — пока нет
 * источника пола получателя. Фронт может передать своё обращение в letter.
 */
export const buildClassicAppeal = (
    data: IOfferWordRenderData,
): string | null => {
    const name = data.RecipientName?.trim();
    return name ? `Здравствуйте, ${name}!` : null;
};

/** Текст письма по умолчанию — с разметкой <color>…</color>. */
export const buildClassicLetterText = (data: IOfferWordRenderData): string => {
    const product = data.GeneralProductName?.trim() || 'система ГАРАНТ';
    const supply = data.GeneralSupplyNameMarketing?.trim();
    const productLine = supply
        ? `<color>${product}</color> (${supply})`
        : `<color>${product}</color>`;
    return [
        'Благодарим за интерес к системе ГАРАНТ.',
        `Направляем коммерческое предложение на информационно-правовое обеспечение: ${productLine}.`,
        'Комплект подобран под задачи вашей компании: состав наполнения и стоимость приведены ниже. Цена зафиксирована на весь срок договора.',
        'Будем рады ответить на вопросы и провести презентацию системы в удобное для вас время.',
    ].join('\n');
};
