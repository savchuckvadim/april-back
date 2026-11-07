import { Injectable, Logger } from '@nestjs/common';
import { ContractGenerateService } from '../services/contract-generate.service';
import { ContractGenerateDto } from '../dto/contract-generate.dto';
import { ContractBitrixPushService } from '../services/contract-bitrix-push.service';
import { ContractGenerateResult } from '../type/contract-generate.type';
import { BitrixDocumentSaveFlowService } from '../../../offer-word/services/bitrix/bitrix-document-save-flow.service';

/** Подпапка договоров в папке сделки на Диске (рядом с КП, отдельно от них). */
export const CONTRACT_DISK_FOLDER = 'Договоры';

@Injectable()
export class ContractGenerateUseCase {
    private readonly logger = new Logger(ContractGenerateUseCase.name);

    constructor(
        private readonly contractGenerateService: ContractGenerateService,
        private readonly contractBitrixPushService: ContractBitrixPushService,
        private readonly saveFlow: BitrixDocumentSaveFlowService,
    ) {}

    /**
     * Договор → Диск Битрикса (как КП: диск группы продаж, папка сделки, в ней
     * «Договоры»; одноимённый файл не перезаписывается) → комментарий в
     * таймлайн со ссылкой на файл в Битриксе. Диск недоступен — в таймлайн и
     * в ответ уходит ссылка на файл на сервере.
     *
     * `file`/`document` остаются серверной ссылкой: их читают машины
     * (init-supply), ссылке Диска нужна авторизация в Битриксе.
     */
    async getContract(
        dto: ContractGenerateDto,
    ): Promise<ContractGenerateResult> {
        const { result, absolutePath } =
            await this.contractGenerateService.generateContractFile(dto);
        const bitrixLink = await this.saveToDisk(dto, result, absolutePath);
        const link = bitrixLink ?? result.link;
        await this.contractBitrixPushService.setInBitrix(
            dto,
            link,
            result.documentName,
        );
        return {
            ...result,
            link,
            bitrixLink,
            savedToDisk: bitrixLink !== null,
        };
    }

    private async saveToDisk(
        dto: ContractGenerateDto,
        result: ContractGenerateResult,
        absolutePath: string,
    ): Promise<string | null> {
        try {
            const saved = await this.saveFlow.saveDocuments({
                domain: dto.domain,
                companyId: dto.companyId,
                userId: Number(dto.userId),
                dealId: dto.dealId,
                documents: [
                    {
                        absolutePath,
                        link: result.link,
                        name: result.documentName,
                        type: 'contract',
                    },
                ],
                onlyBitrixSave: true,
                disk: { subfolder: CONTRACT_DISK_FOLDER, uniqueNames: true },
            });
            const uploaded = saved.documents[0]?.link;
            return uploaded && uploaded !== result.link ? uploaded : null;
        } catch (error) {
            const reason =
                error instanceof Error ? error.message : String(error);
            this.logger.warn(
                `Договор не загружен на Диск (${dto.domain}, сделка ${dto.dealId}): ${reason} — ссылка на сервер`,
            );
            return null;
        }
    }
}
