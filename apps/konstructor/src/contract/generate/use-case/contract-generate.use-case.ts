import { Injectable } from '@nestjs/common';
import { ContractGenerateService } from '../services/contract-generate.service';
import { ContractGenerateDto } from '../dto/contract-generate.dto';
import { ContractBitrixPushService } from '../services/contract-bitrix-push.service';
import { ContractGenerateResult } from '../type/contract-generate.type';

@Injectable()
export class ContractGenerateUseCase {
    constructor(
        private readonly contractGenerateService: ContractGenerateService,
        private readonly contractBitrixPushService: ContractBitrixPushService,
    ) {}

    /**
     * Договор + комментарий в таймлайн.
     *
     * Результат прокидывается целиком, а не пересобирается по полям: иначе
     * `file`/`document` (их ждёт фронт и читает init-supply) потерялись бы
     * по пути. Форму ответа задаёт один тип — `ContractGenerateResult`.
     */
    async getContract(
        dto: ContractGenerateDto,
    ): Promise<ContractGenerateResult> {
        const result = await this.contractGenerateService.generateContract(dto);
        await this.contractBitrixPushService.setInBitrix(
            dto,
            result.link,
            result.documentName,
        );
        return result;
    }
}
