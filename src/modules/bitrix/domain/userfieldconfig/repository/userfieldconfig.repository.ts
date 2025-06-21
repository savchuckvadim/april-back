import { BitrixBaseApi, EBXEntity, EBxMethod, EBxNamespace } from "@/modules/bitrix/core";
import { UserFieldConfigAddDto, UserFieldConfigDeleteDto, UserFieldConfigGetDto, UserFieldConfigListDto, UserFieldConfigUpdateDto } from "../dto/userfieldconfig.dto";


export class UserFieldConfigRepository {

    constructor(
        private readonly bxApi: BitrixBaseApi
    ) { }

    async get(dto: UserFieldConfigGetDto) {
        return this.bxApi.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER_FIELD_CONFIG,
            EBxMethod.GET,
            dto
        );
    }
    getBtch(btchCommand: string, dto: UserFieldConfigGetDto) {
        return this.bxApi.addCmdBatchType(
            btchCommand,
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER_FIELD_CONFIG,
            EBxMethod.GET,
            dto
        );
    }
    async add(dto: UserFieldConfigAddDto) {
        return this.bxApi.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER_FIELD_CONFIG,
            EBxMethod.ADD,
            dto
        );
    }
    addBtch(btchCommand: string, dto: UserFieldConfigAddDto) {
        return this.bxApi.addCmdBatchType(
            btchCommand,
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER_FIELD_CONFIG,
            EBxMethod.ADD,
            dto
        );
    }
    async update(dto: UserFieldConfigUpdateDto) {
        return this.bxApi.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER_FIELD_CONFIG,
            EBxMethod.UPDATE,
            dto
        );
    }
    updateBtch(btchCommand: string, dto: UserFieldConfigUpdateDto) {
        return this.bxApi.addCmdBatchType(
            btchCommand,
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER_FIELD_CONFIG,
            EBxMethod.UPDATE,
            dto
        );
    }
    async delete(dto: UserFieldConfigDeleteDto) {
        return this.bxApi.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER_FIELD_CONFIG,
            EBxMethod.DELETE,
            dto
        );
    }
    deleteBtch(btchCommand: string, dto: UserFieldConfigDeleteDto) {
        return this.bxApi.addCmdBatchType(
            btchCommand,
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER_FIELD_CONFIG,
            EBxMethod.DELETE,
            dto
        );
    }
    async list(dto: UserFieldConfigListDto) {
        return this.bxApi.callType(
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER_FIELD_CONFIG,
            EBxMethod.LIST,
            dto
        );
    }
    listBtch(btchCommand: string, dto: UserFieldConfigListDto) {
        return this.bxApi.addCmdBatchType(
            btchCommand,
            EBxNamespace.WITHOUT_NAMESPACE,
            EBXEntity.USER_FIELD_CONFIG,
            EBxMethod.LIST,
            dto
        );
    }


}