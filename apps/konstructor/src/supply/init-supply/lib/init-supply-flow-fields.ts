import { InitSupplyDto, InitSupplyFlow } from '../dto/init-supply.dto';

/**
 * Поля заявки RPA, которые зависят от сценария: поставка это или
 * перезаключение.
 *
 * Вынесено из `InitSupplyRpaFieldsService` отдельной функцией, потому что
 * именно здесь сотрудник отдела сервиса отличает одно от другого: по названию
 * заявки и по галке «Перезаключение». Ошибка тут не видна в коде, но сразу
 * видна в работе — заявки перестают фильтроваться.
 */
export interface InitSupplyFlowFieldIds {
    /** UF-имя поля «Название» заявки. */
    nameField: string | undefined;
    /** UF-имя поля «Перезаключение» (галка). */
    extensionField: string | undefined;
    /** UF-имя поля «Тип договора». */
    contractTypeField: string | undefined;
}

/**
 * Тип договора для заявки. Берём имя портального договора — именно он
 * источник правды (`portal_contracts`), а не подпись из состояния фронта.
 */
export const resolveSupplyContractTypeName = (
    dto: InitSupplyDto,
): string | null => {
    const portalContractName = dto.contract?.contract?.name;
    if (portalContractName) {
        return portalContractName;
    }
    return dto.contract?.bitrixName || dto.contract?.aprilName || null;
};

export const buildInitSupplyFlowFields = (
    dto: InitSupplyDto,
    fieldIds: InitSupplyFlowFieldIds,
): Record<string, string | boolean> => {
    const isSupply = dto.flow === InitSupplyFlow.SUPPLY;
    const result: Record<string, string | boolean> = {};

    if (fieldIds.nameField) {
        result[fieldIds.nameField] = isSupply
            ? `Поставка "${dto.companyName}"`
            : `Перезаключение ${dto.companyName}`;
    }
    if (fieldIds.extensionField) {
        result[fieldIds.extensionField] = !isSupply;
    }

    const contractTypeName = resolveSupplyContractTypeName(dto);
    if (fieldIds.contractTypeField && contractTypeName) {
        result[fieldIds.contractTypeField] = contractTypeName;
    }

    return result;
};
