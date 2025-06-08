import { Injectable } from "@nestjs/common";
import { PBXService } from "src/modules/pbx";
import { FieldsService } from "../fields.service";

@Injectable()
export class FieldsFactoryService {
    constructor(
        private readonly pbx: PBXService,
    ) { }

    async getService(domain: string) {
        const { bitrix } = await this.pbx.init(domain);
        return new FieldsService(bitrix);

    }
}
