import { Injectable } from "@nestjs/common";
import { PBXService } from "../pbx";

@Injectable()
export class HelperBitrixService {
    constructor(
        private readonly pbxService: PBXService
    ) { }

    async bxMethod(domain: string, method: string, params: any) {
        const { bitrix } = await this.pbxService.init(domain);
        const result = await bitrix.api.call(method, params);
        return result;
    }
}