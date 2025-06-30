import { Injectable } from "@nestjs/common";
import { IBxRpaItem } from "../interface/bx-rpa-item.interface";
import { BitrixBaseApi } from "@/modules/bitrix/core/base/bitrix-base-api";
import { AddRpaItemDto, GetRpaItemDto, ListRpaItemDto, UpdateRpaItemDto } from "../dto/rpa-item.dto";
import { EBxMethod } from "@/modules/bitrix/core";
import { EBxNamespace } from "@/modules/bitrix/core/domain/consts/bitrix-api.enum";
import { EBXEntity } from "@/modules/bitrix/core/domain/consts/bitrix-entities.enum";


@Injectable()
export class BxRpaItemRepository {
    constructor(
        private readonly bxApi: BitrixBaseApi
    ) {
    }
    async getRpaItem(dto: GetRpaItemDto) {
        return this.bxApi.callType(
            EBxNamespace.RPA,
            EBXEntity.ITEM,
            EBxMethod.GET,
            dto
        );
    }
    getRpaItemBtch(cmdCode: string, dto: GetRpaItemDto) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.RPA,
            EBXEntity.ITEM,
            EBxMethod.GET,
            dto
        );
    }

    async addRpaItem(dto: AddRpaItemDto) {
        return this.bxApi.callType(
            EBxNamespace.RPA,
            EBXEntity.ITEM,
            EBxMethod.ADD,
            dto
        );
    }

    addRpaItemBtch(cmdCode: string, dto: AddRpaItemDto) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.RPA,
            EBXEntity.ITEM,
            EBxMethod.ADD,
            dto
        );
    }

    async updateRpaItem(dto: UpdateRpaItemDto) {
        return this.bxApi.callType(
            EBxNamespace.RPA,
            EBXEntity.ITEM,
            EBxMethod.UPDATE,
            dto
        );
    }

    updateRpaItemBtch(cmdCode: string, dto: UpdateRpaItemDto) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.RPA,
            EBXEntity.ITEM,
            EBxMethod.UPDATE,
            dto
        );
    }
    async listRpaItem(dto: ListRpaItemDto) {
        return this.bxApi.callType(
            EBxNamespace.RPA,
            EBXEntity.ITEM,
            EBxMethod.LIST,
            dto
        );
    }
    listRpaItemBtch(cmdCode: string, dto: ListRpaItemDto) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.RPA,
            EBXEntity.ITEM,
            EBxMethod.LIST,
            dto
        );
    }
}