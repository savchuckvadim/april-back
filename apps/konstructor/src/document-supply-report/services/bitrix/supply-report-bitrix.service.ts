import { Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';
import { IPortal } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { getErrorString } from '@lib/shared';

/**
 * Комментарий в таймлайн сделки со ссылкой на отчёт.
 *
 * Намеренно НЕ @Injectable: внутри живёт per-domain инстанс Bitrix, держать его
 * в синглтоне нельзя (CLAUDE.md — race condition). Создаётся через
 * `new SupplyReportBitrixService(bitrix)` в use-case.
 */
export class SupplyReportBitrixService {
    private readonly logger = new Logger(SupplyReportBitrixService.name);

    constructor(private readonly bitrixService: BitrixService) {}

    /**
     * Ссылка на docx (и на pdf, если он собрался) одним комментарием.
     *
     * Laravel слал два комментария: первый сразу, второй — из очереди после
     * конвертации в PDF. Здесь конвертация синхронная, поэтому комментарий один.
     */
    async addTimelineComment(
        portal: IPortal,
        dealId: string,
        fileName: string,
        link: string,
        pdfLink?: string,
    ): Promise<void> {
        try {
            this.bitrixService.init(portal.domain);

            const pdfFileName = fileName.replace(/\.docx$/, '.pdf');
            const message = pdfLink
                ? `<a href="${link}" target="_blank">${fileName}</a><br><a href="${pdfLink}" target="_blank">${pdfFileName}</a>`
                : `<a href="${link}" target="_blank">${fileName}</a>`;

            await this.bitrixService.api.call('crm.timeline.comment.add', {
                fields: {
                    ENTITY_ID: dealId,
                    ENTITY_TYPE: 'deal',
                    COMMENT: message,
                },
            });

            this.logger.log(`Комментарий добавлен в сделку ${dealId}`);
        } catch (error) {
            throw new Error(
                `Не удалось добавить комментарий в таймлайн: ${getErrorString(error)}`,
            );
        }
    }
}
