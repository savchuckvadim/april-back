import { Injectable } from "@nestjs/common";
import { ContractGenerateService } from "../services/contract-generate.service";
import { ContractGenerateDto } from "../dto/contract-generate.dto";
import { ContractBitrixPushService } from "../services/contract-bitrix-push.service";


@Injectable()
export class ContractGenerateUseCase {
    constructor(
        private readonly contractGenerateService: ContractGenerateService,
        private readonly contractBitrixPushService: ContractBitrixPushService
    ) { }

    async getContract(dto: ContractGenerateDto) {
        const { link, documentName, data, provider } = await this.contractGenerateService.generateContract(dto);
        await this.contractBitrixPushService.setInBitrix(dto, link, documentName);
        return { link, documentName, data, provider };

    }
}
