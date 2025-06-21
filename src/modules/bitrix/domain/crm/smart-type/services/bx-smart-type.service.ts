import { BitrixBaseApi } from "@/modules/bitrix/core/base/bitrix-base-api";
import { BxSmartTypeRepository } from "../repository/bx-smart-type.repository";
import { BxCategoryRepository } from "../../category/repository/bx-category.repository";
import { BxStatusRepository } from "../../status/repository/bx-status.repository";
import { IBXFullCategory, IBXSmartFullType, IBXSmartType } from "../interface/smart-type.interface";
import { IBXStatus } from "../../status/interface/bx-status.interface";
import { SmartTypeGetByEntityTypeIdRequestDto, SmartTypeGetRequestDto, SmartTypeListRequestDto } from "../dto/smart-type.dto";
import { SmartTypeAddRequestDto, SmartTypeUpdateRequestDto } from "../dto/smart-type-add.dto";

export class BxSmartTypeService {
    private repo: BxSmartTypeRepository
    private categoryRepo: BxCategoryRepository
    private statusRepo: BxStatusRepository

    clone(api: BitrixBaseApi): BxSmartTypeService {
        const instance = new BxSmartTypeService();
        instance.init(api);
        return instance;
    }


    init(api: BitrixBaseApi) {
        this.repo = new BxSmartTypeRepository(api);
        this.categoryRepo = new BxCategoryRepository(api);
        this.statusRepo = new BxStatusRepository(api);
    }

    async list(dto: SmartTypeListRequestDto) {
        const smartType = await this.repo.getList(dto);
        return smartType;
    }

    async getByEntityTypeId(dto: SmartTypeGetByEntityTypeIdRequestDto) {
        const smartType = await this.repo.getByEntityTypeId(dto);
        return smartType;
    }

    async getById(dto: SmartTypeGetRequestDto) {
        const smartType = await this.repo.get(dto);
        return smartType;
    }

    async getSmartFull(dto: SmartTypeGetByEntityTypeIdRequestDto): Promise<IBXSmartFullType> {
        const smartType = await this.repo.getByEntityTypeId(dto);
        return this.getFullSmartData(smartType.result.type, dto.entityTypeId);
    }

    async getListFull(dto: SmartTypeListRequestDto): Promise<IBXSmartFullType[]> {
        const smartType = await this.repo.getList(dto);
        const result = [] as IBXSmartFullType[]
        for (const type of smartType.result.types) {
            result.push(await this.getFullSmartData(type, type.entityTypeId as string));
        }
        return result;
    }

    private async getFullSmartData(smart: IBXSmartType, entityTypeId: string | number): Promise<IBXSmartFullType> {
        const result = {
            ...smart,
            categories: []
        } as IBXSmartFullType

        const categoriesResponse = await this.categoryRepo.getList(entityTypeId);


        const categories = [] as IBXFullCategory[]
        for (const category of categoriesResponse.result.categories) {
            const stagesResponse = await this.statusRepo.getList(
                {
                    CATEGORY_ID: category.id
                }
            );
            const categoryData: IBXFullCategory = {
                id: category.id,
                name: category.name,
                entityTypeId: category.entityTypeId,
                stages: stagesResponse.result
            }
            categories.push(categoryData);
        }
        result.categories = categories;
        return result;

    }

    async add(dto: SmartTypeAddRequestDto) {
        const smartType = await this.repo.add(dto);
        return smartType;
    }

    async update(dto: SmartTypeUpdateRequestDto) {
        const smartType = await this.repo.update(dto);
        return smartType;
    }

    async delete(dto: SmartTypeGetRequestDto) {
        const smartType = await this.repo.delete(dto);
        return smartType;
    }
}