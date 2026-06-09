import { Address } from '@/apps/rq/types/bx-address.type';
import {
    TypeIdAddress,
    getTypeIdAddressName,
} from '@/apps/rq/types/type-id-address.enum';
import {
    ADDRESS_TYPE_NAMES,
    REQUIRED_ADDRESS_TYPES,
} from '../consts/address.consts';
import { BitrixOwnerTypeId } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';

/**
 * Утилиты для работы с адресами
 */

/**
 * Преобразует сырые данные адреса в объект Address
 */
export const mapAddressFromRaw = (
    rawAddress: Partial<Address> | Record<string, unknown>,
): Address => {
    const address = new Address(rawAddress as Partial<Address>);
    const typeId = Number(address.TYPE_ID);
    address.TYPE = getTypeIdAddressName(typeId as TypeIdAddress);
    return address;
};

/**
 * Фильтрует адреса по типу (только LEGAL и FACTUAL)
 */
export const filterAddressesByType = (
    addresses: (Partial<Address> | Record<string, unknown>)[],
): Address[] => {
    const filtered: Address[] = [];
    for (const adr of addresses) {
        const address = mapAddressFromRaw(adr);
        const typeId = Number(address.TYPE_ID);

        if (
            typeId &&
            REQUIRED_ADDRESS_TYPES.includes(
                typeId as (typeof REQUIRED_ADDRESS_TYPES)[number],
            )
        ) {
            filtered.push(address);
        }
    }
    return filtered;
};

/**
 * Проверяет наличие адреса указанного типа
 */
export const hasAddressOfType = (
    addresses: Address[] | null | undefined,
    typeName: string,
): boolean => {
    if (!addresses) return false;
    return addresses.some(addr => addr.TYPE === typeName);
};

/**
 * Создает пустой адрес указанного типа
 */
export const createEmptyAddress = (
    typeId: TypeIdAddress,
    anchorId: number,
    entityId: number,
): Address => {
    const anchorTypeId = BitrixOwnerTypeId.COMPANY;
    const entityTypeId = BitrixOwnerTypeId.REQUISITE;
    const address = new Address({
        TYPE_ID: typeId,
        TYPE: getTypeIdAddressName(typeId),
        ANCHOR_TYPE_ID: anchorTypeId,
        ENTITY_TYPE_ID: entityTypeId,
        ANCHOR_ID: anchorId,
        ENTITY_ID: entityId,
    });

    return address;
};

/**
 * Интерфейс для объекта с адресами
 */
export interface RequisiteWithAddress {
    address?: Address[] | null;
}

/**
 * Добавляет недостающие адреса (юридический и фактический)
 */
export const addMissingAddresses = (
    requisite: RequisiteWithAddress,
    anchorId: number,
    entityId: number,
): void => {
    // Юридический адрес
    try {
        if (!hasAddressOfType(requisite.address, ADDRESS_TYPE_NAMES.LEGAL)) {
            requisite.address = requisite.address || [];
            requisite.address.push(
                createEmptyAddress(TypeIdAddress.LEGAL, anchorId, entityId),
            );
        }
    } catch {
        if (!requisite.address) {
            requisite.address = [];
        }
        requisite.address.push(
            createEmptyAddress(TypeIdAddress.LEGAL, anchorId, entityId),
        );
    }

    // Фактический адрес
    try {
        if (!hasAddressOfType(requisite.address, ADDRESS_TYPE_NAMES.FACTUAL)) {
            requisite.address = requisite.address || [];
            requisite.address.push(
                createEmptyAddress(TypeIdAddress.FACTUAL, anchorId, entityId),
            );
        }
    } catch {
        if (!requisite.address) {
            requisite.address = [];
        }
        requisite.address.push(
            createEmptyAddress(TypeIdAddress.FACTUAL, anchorId, entityId),
        );
    }
};

/**
 * Фильтрует поля адреса, убирая пустые значения
 */
export const filterAddressFields = (
    address: Address,
): Record<string, unknown> => {
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(address)) {
        if (value !== null && value !== undefined && value !== '') {
            fields[key] = value;
        }
    }
    return fields;
};

/**
 * Тип для TYPE_ID, который может быть числом или объектом с полем value
 */
type AddressTypeId =
    | TypeIdAddress
    | number
    | { value: number }
    | null
    | undefined;

/**
 * Нормализует TYPE_ID адреса (извлекает число из объекта или возвращает число)
 */
export const normalizeAddressTypeId = (typeId: AddressTypeId): number => {
    if (typeof typeId === 'number') {
        return typeId;
    }
    if (typeId && typeof typeId === 'object' && 'value' in typeId) {
        return (typeId as { value: number }).value;
    }
    return Number(typeId) || 0;
};

/**
 * Устанавливает TYPE для адреса на основе TYPE_ID
 */
export const setAddressType = (address: Address): void => {
    address.TYPE = getTypeIdAddressName(address.TYPE_ID as TypeIdAddress);
};
