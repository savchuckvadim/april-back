import { BitrixBaseApi } from "@/modules/bitrix/core";
import { UserFieldConfigRepository } from "../repository/userfieldconfig.repository";
import { UserFieldConfigAddDto, UserFieldConfigDeleteDto, UserFieldConfigGetDto, UserFieldConfigListDto, UserFieldConfigUpdateDto } from "../dto/userfieldconfig.dto";


export class BxUserFieldConfigService {

    private repo: UserFieldConfigRepository

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

}