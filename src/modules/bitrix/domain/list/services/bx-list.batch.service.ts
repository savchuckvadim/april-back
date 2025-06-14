import { Injectable } from "@nestjs/common";
import { BxListRepository } from "../repository/bx-list.repository";
import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { EBxListCode } from "../interface/bx-list.interface";

@Injectable()
export class BxListBatchService {
    clone(api: BitrixBaseApi): BxListBatchService {
        const instance = new BxListBatchService();
        instance.init(api);
        return instance;
    }

    private repo: BxListRepository;

    init(api: BitrixBaseApi) {
        this.repo = new BxListRepository(api);
    }

    getList(cmdCode: string, IBLOCK_CODE?: EBxListCode) {
        return this.repo.getListBtch(cmdCode, IBLOCK_CODE);
    }

    getListField(
        cmdCode: string,
        code: EBxListCode,
        ID: string | number
    ) {
        return this.repo.getListFieldBtch(cmdCode, code, ID);
    }

    getListFields(
        cmdCode: string,
        code: EBxListCode
    ) {
        return this.repo.getListFieldsBtch(cmdCode, code);
    }
} 