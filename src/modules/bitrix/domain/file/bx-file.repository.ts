import { EBXEntity, EBxMethod, EBxNamespace } from "../../core";
import { BitrixBaseApi } from "../../core/base/bitrix-base-api";

export class BxFileRepository {
    constructor(private readonly bitrixService: BitrixBaseApi) { }

    async get(id: number) {
        return this.bitrixService.callType(
            EBxNamespace.DISK,
            EBXEntity.FILE,
            EBxMethod.GET,
            { id }
        );
    }

    
    async getBtch(cmdCode: string, id: number | string) {
        return this.bitrixService.addCmdBatchType(
            cmdCode,
            EBxNamespace.DISK,
            EBXEntity.FILE,
            EBxMethod.GET,
            { id }
        );
    }

}
