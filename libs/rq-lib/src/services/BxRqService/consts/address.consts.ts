import {
    TypeIdAddress,
    getTypeIdAddressName,
} from '../../../types/type-id-address.enum';

/**
 * Константы для работы с адресами
 */
export const ADDRESS_TYPE_NAMES = {
    LEGAL: 'Юридический адрес',
    FACTUAL: 'Фактический адрес',
} as const;

export const REQUIRED_ADDRESS_TYPES = [
    TypeIdAddress.LEGAL,
    TypeIdAddress.FACTUAL,
] as const;

export const getAddressTypeName = (typeId: TypeIdAddress): string => {
    return getTypeIdAddressName(typeId);
};
