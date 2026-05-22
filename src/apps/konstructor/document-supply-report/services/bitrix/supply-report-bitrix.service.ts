import { Injectable, Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { IPortal } from '@/modules/portal/interfaces/portal.interface';

export class SupplyReportBitrixService {
    private readonly logger = new Logger(SupplyReportBitrixService.name);

    constructor(private readonly bitrixService: BitrixService) {}

    /**
     * Отправляет комментарий в Bitrix с ссылкой на документ
     */
    async addTimelineComment(
        portal: IPortal,
        dealId: string,
        fileName: string,
        link: string,
    ): Promise<void> {
        try {
            // Инициализируем Bitrix API для портала
            this.bitrixService.init(portal);

            const message = `<a href="${link}" target="_blank">${fileName}</a>`;

            await this.bitrixService.api.call('crm.timeline.comment.add', {
                fields: {
                    ENTITY_ID: dealId,
                    ENTITY_TYPE: 'deal',
                    COMMENT: message,
                },
            });

            this.logger.log(`Timeline comment added for deal ${dealId}`);
        } catch (error) {
            this.logger.error(
                `Error adding timeline comment: ${error.message}`,
                error.stack,
            );
            throw new Error(`Failed to add timeline comment: ${error.message}`);
        }
    }
}
