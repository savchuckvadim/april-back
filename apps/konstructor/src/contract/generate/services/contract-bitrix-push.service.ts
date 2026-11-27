import { PBXService } from '@lib/pbx/pbx.service';
import { ContractGenerateDto } from '../dto/contract-generate.dto';
import { BitrixEntityType } from '@lib/bitrix';
import { Injectable, Logger } from '@nestjs/common';
import { contractTimelineComment } from '../lib/contract-timeline.util';

@Injectable()
export class ContractBitrixPushService {
    private readonly logger = new Logger(ContractBitrixPushService.name);

    constructor(private readonly pbx: PBXService) {}

    /**
     * Комментарий со ссылкой на договор в таймлайн компании и сделки. Прямыми
     * вызовами, как ссылка на папку поставки: закодированный адрес Диска
     * доезжает до комментария без второго раскодирования batch-командой.
     * Сбой одного комментария договор не отменяет: он уже сформирован и лежит
     * на Диске.
     */
    public async setInBitrix(
        dto: ContractGenerateDto,
        link: string,
        documentName: string,
    ) {
        const { bitrix } = await this.pbx.init(dto.domain);
        const comment = contractTimelineComment(link, documentName);
        const targets: Array<[BitrixEntityType, number | string]> = [
            [BitrixEntityType.COMPANY, dto.companyId],
            ...(dto.dealId
                ? [
                      [BitrixEntityType.DEAL, dto.dealId] as [
                          BitrixEntityType,
                          number | string,
                      ],
                  ]
                : []),
        ];

        for (const [entityType, entityId] of targets) {
            try {
                await bitrix.timeline.addTimelineComment({
                    ENTITY_ID: entityId,
                    ENTITY_TYPE: entityType,
                    COMMENT: comment,
                    AUTHOR_ID: dto.userId.toString(),
                });
            } catch (error) {
                const reason =
                    error instanceof Error ? error.message : String(error);
                this.logger.warn(
                    `Комментарий о договоре не добавлен (${dto.domain}, ${entityType} ${entityId}): ${reason}`,
                );
            }
        }
    }
}
