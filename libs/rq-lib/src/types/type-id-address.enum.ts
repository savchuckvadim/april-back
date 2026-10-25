export enum TypeIdAddress {
    FACTUAL = 1,
    REGISTRATION = 4,
    LEGAL = 6,
    BENEFICIARY = 9,
    DELIVERY = 11,
}

export function getTypeIdAddressName(typeId: TypeIdAddress): string {
    const names: Record<TypeIdAddress, string> = {
        [TypeIdAddress.FACTUAL]: 'Фактический адрес',
        [TypeIdAddress.REGISTRATION]: 'Адрес регистрации',
        [TypeIdAddress.LEGAL]: 'Юридический адрес',
        [TypeIdAddress.BENEFICIARY]: 'Адрес бенефициара',
        [TypeIdAddress.DELIVERY]: 'Адрес доставки',
    };
    return names[typeId] || 'Неизвестный тип адреса';
}
