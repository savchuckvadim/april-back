import { PBXService } from "src/modules/pbx";
import { Injectable } from "@nestjs/common";
import { ColdCallQueryDto } from "../dto/cold.dto";
import { ColdCallService } from "../services/cold-call.service";

@Injectable()
export class ColdCallUseCase {
    constructor(private readonly pbx: PBXService) { }

    async init(domain: string) {
        const {bitrix, portal} = await this.pbx.init(domain)
      
    }

    async flow(dto: ColdCallQueryDto, domain: string) {
        const service = new ColdCallService(this.pbx)
        await service.flow(dto, domain)
    }
}