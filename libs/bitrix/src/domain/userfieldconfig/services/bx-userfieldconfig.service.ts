import { UserFieldConfigRepository } from '../repository/userfieldconfig.repository';
import {
    UserFieldConfigAddDto,
    UserFieldConfigDeleteDto,
    UserFieldConfigGetDto,
    UserFieldConfigListDto,
    UserFieldConfigUpdateDto,
} from '../dto/userfieldconfig.dto';
import {
    EUserFieldType,
    IUserFieldConfig,
} from '../interface/userfieldconfig.interface';
import { BitrixBaseApi } from '@/modules/bitrix/core/base/bitrix-base-api';

/**
 * `userfieldconfig.*` — UF-поля CRM (в т.ч. смарт-процессов).
 *
 * ## ⚠️ КОВАРСТВО: два разных id смарт-типа (боевой инцидент 2026-07-21)
 *
 * У смарт-процесса ДВА идентификатора, и здесь нужен «маленький»:
 * - **`id` из `crm.type.list`** (напр. 7; в PortalDB — `smarts.bitrixId`) —
 *   ИМЕННО он адресует поля: `entityId = CRM_{id}`,
 *   имена полей `UF_CRM_{id}_{CODE}`, camel-ключи `ufCrm{id}{Camel}`;
 * - **`entityTypeId`** (напр. 177/1056; `smarts.entityTypeId`) — ТОЛЬКО для
 *   `crm.item.*` и `crm.type.getSmartFull`, сюда НЕ передавать.
 *
 * На `CRM_{entityTypeId}` Bitrix отвечает «Вы не можете просматривать
 * настройки пользовательских полей» — ТОЙ ЖЕ фразой, что и при реальной
 * нехватке прав администратора CRM, так что диагностика уводит в «проблему
 * ключа», хотя entityId просто не существует.
 *
 * Пример из доки Bitrix: тип с id=7 и entityTypeId=177 →
 * `entityId: 'CRM_7'`, `fieldName: 'UF_CRM_7_...'`.
 */
export class BxUserFieldConfigService {
    private repo: UserFieldConfigRepository;

    clone(api: BitrixBaseApi): BxUserFieldConfigService {
        const instance = new BxUserFieldConfigService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new UserFieldConfigRepository(api);
    }

    /** `userfieldconfig.get` по id поля. Отдаёт `enum` с Bitrix-id (в отличие от `list`). */
    async get(dto: UserFieldConfigGetDto) {
        return await this.repo.get(dto);
    }

    /**
     * `userfieldconfig.add`.
     *
     * ⚠️ Для смартов `field.entityId = CRM_{id из crm.type.list}` (НЕ
     * entityTypeId!) — иначе ошибка «Вы не можете просматривать настройки»,
     * неотличимая от нехватки прав. Подробности — в jsdoc класса.
     */
    async add(dto: UserFieldConfigAddDto) {
        return await this.repo.add(dto);
    }

    /** `userfieldconfig.update` по id поля. */
    async update(dto: UserFieldConfigUpdateDto) {
        return await this.repo.update(dto);
    }

    /** `userfieldconfig.delete` по id поля. */
    async delete(dto: UserFieldConfigDeleteDto) {
        return await this.repo.delete(dto);
    }

    /**
     * `userfieldconfig.list`.
     *
     * ⚠️ Для смартов `filter.entityId = CRM_{id из crm.type.list}` (НЕ
     * entityTypeId!) — на несуществующий entityId Bitrix отвечает «Вы не
     * можете просматривать настройки», как при нехватке прав. Подробности —
     * в jsdoc класса. `enum`-элементы этот метод НЕ возвращает — см.
     * {@link getAllWithItems}.
     */
    async list(dto: UserFieldConfigListDto) {
        return await this.repo.list(dto);
    }

    /**
     * Все поля по фильтру (постраничный обход `userfieldconfig.list`).
     *
     * ⚠️ Для смартов `filter.entityId = CRM_{id из crm.type.list}` (НЕ
     * entityTypeId!) — см. jsdoc класса.
     */
    async getAll(
        moduleId: 'crm' | 'rpa',
        filter: Partial<IUserFieldConfig>,
    ): Promise<IUserFieldConfig[]> {
        const items: IUserFieldConfig[] = [];
        let needMore = true;
        let nextId: string | number = 0;
        while (needMore) {
            const fullFilter = { ...filter, '>id': nextId };
            const { result } = await this.repo.list({
                moduleId,
                filter: fullFilter,
                order: { id: 'ASC' },
            });
            if (result.fields.length === 0) break;
            nextId = result.fields[result.fields.length - 1]?.id ?? 0;
            if (nextId === 0) needMore = false;
            items.push(...result.fields);
        }
        return items;
    }

    /**
     * Как `getAll`, но для enumeration-полей дотягивает `enum`-элементы.
     *
     * `userfieldconfig.list` (на котором построен `getAll`) НЕ возвращает enum-элементы,
     * поэтому для каждого enumeration-поля без `enum` делается отдельный `get`
     * (он, в отличие от `list`, отдаёт `enum` с Bitrix-id). Нужно, например, чтобы при
     * установке/мониторинге enum-значения попадали в PortalDB (`bitrixfield_items`).
     *
     * ⚠️ Для смартов `filter.entityId = CRM_{id из crm.type.list}` (НЕ
     * entityTypeId!) — см. jsdoc класса.
     */
    async getAllWithItems(
        moduleId: 'crm' | 'rpa',
        filter: Partial<IUserFieldConfig>,
    ): Promise<IUserFieldConfig[]> {
        const fields = await this.getAll(moduleId, filter);
        for (const field of fields) {
            if (field.userTypeId !== EUserFieldType.ENUMERATION) continue;
            if (field.enum && field.enum.length > 0) continue;
            if (field.id == null) continue;
            const { result } = await this.get({ moduleId, id: field.id });
            if (result?.field?.enum) {
                field.enum = result.field.enum;
            }
        }
        return fields;
    }
}
