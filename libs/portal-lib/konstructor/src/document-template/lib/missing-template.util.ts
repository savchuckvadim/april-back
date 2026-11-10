import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { TemplateCriteria } from '../document-template.criteria';
import { CONTRACT_TYPE_TITLES, SUPPLY_TITLES } from './seed-plan.util';

const CLIENT_TYPE_TITLES: Record<ClientTypeEnum, string> = {
    [ClientTypeEnum.ORG_STATE]: 'бюджетная организация',
    [ClientTypeEnum.ORG]: 'организация',
    [ClientTypeEnum.IP]: 'ИП',
    [ClientTypeEnum.FIZ]: 'физлицо',
    [ClientTypeEnum.ADVOKAT]: 'адвокат',
};

/**
 * Текст для менеджера и владельца, когда под договор нет шаблона: какой
 * именно шаблон завести и где. Подменять документ «каким-нибудь» файлом
 * нельзя — так бюджетник получал коммерческий договор с авансом.
 */
export const describeMissingContractTemplate = (
    criteria: TemplateCriteria,
): string => {
    const parts: string[] = [];
    if (criteria.contractType) {
        parts.push(
            `«${CONTRACT_TYPE_TITLES[criteria.contractType] ?? criteria.contractType}»`,
        );
    }
    if (criteria.supplyType) {
        parts.push(
            `поставка «${SUPPLY_TITLES[criteria.supplyType] ?? criteria.supplyType}»`,
        );
    }
    if (criteria.clientType) {
        parts.push(
            `клиент «${CLIENT_TYPE_TITLES[criteria.clientType] ?? criteria.clientType}»`,
        );
    }
    return (
        `Нет шаблона договора: ${parts.join(', ')}. ` +
        'Загрузите его в админке: «Конструктор → Шаблоны договоров» — для всех порталов, ' +
        '«Портал → Конструктор → Шаблоны договоров» — только для этого портала.'
    );
};
