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

    async get(dto: UserFieldConfigGetDto) {
        return await this.repo.get(dto);
    }

    async add(dto: UserFieldConfigAddDto) {
        return await this.repo.add(dto);
    }

    async update(dto: UserFieldConfigUpdateDto) {
        return await this.repo.update(dto);
    }

    async delete(dto: UserFieldConfigDeleteDto) {
        return await this.repo.delete(dto);
    }

    async list(dto: UserFieldConfigListDto) {
        return await this.repo.list(dto);
    }

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
