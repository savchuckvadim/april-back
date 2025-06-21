import { BitrixBaseApi } from "@/modules/bitrix/core";
import { UserFieldConfigRepository } from "../repository/userfieldconfig.repository";
import { UserFieldConfigAddDto, UserFieldConfigDeleteDto, UserFieldConfigGetDto, UserFieldConfigListDto, UserFieldConfigUpdateDto } from "../dto/userfieldconfig.dto";


export class BxUserFieldConfigBatchService {

    private repo: UserFieldConfigRepository

    clone(api: BitrixBaseApi): BxUserFieldConfigBatchService {
        const instance = new BxUserFieldConfigBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new UserFieldConfigRepository(api);
    }

    getBtch(btchCommand: string, dto: UserFieldConfigGetDto) {
        return this.repo.getBtch(btchCommand, dto);
    }

    addBtch(btchCommand: string, dto: UserFieldConfigAddDto) {
        return this.repo.addBtch(btchCommand, dto);
    }

    updateBtch(btchCommand: string, dto: UserFieldConfigUpdateDto) {
        return this.repo.updateBtch(btchCommand, dto);
    }


    deleteBtch(btchCommand: string, dto: UserFieldConfigDeleteDto) {
        return this.repo.deleteBtch(btchCommand, dto);
    }

    listBtch(btchCommand: string, dto: UserFieldConfigListDto) {
        return this.repo.listBtch(btchCommand, dto);
    }
}