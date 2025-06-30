import { BitrixBaseApi } from "@/modules/bitrix/core";
import { BxRpaItemRepository } from "../repository/bx-rpa-item.repository";
import { AddRpaItemDto, GetRpaItemDto, UpdateRpaItemDto } from "../dto/rpa-item.dto";
import { ListRpaItemDto } from "../dto/rpa-item.dto";



export class BxRpaItemBatchService {
    private repo: BxRpaItemRepository


    clone(api: BitrixBaseApi): BxRpaItemBatchService {
        const instance = new BxRpaItemBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxRpaItemRepository(api);
    }

    get(cmdCode: string, dto: GetRpaItemDto) {
        return this.repo.getRpaItemBtch(cmdCode, dto);
    }

    add(cmdCode: string, dto: AddRpaItemDto) {
        return this.repo.addRpaItemBtch(cmdCode, dto);
    }

    update(cmdCode: string, dto: UpdateRpaItemDto) {
        return this.repo.updateRpaItemBtch(cmdCode, dto);
    }

    list(cmdCode: string, dto: ListRpaItemDto) {
        return this.repo.listRpaItemBtch(cmdCode, dto);
    }
}