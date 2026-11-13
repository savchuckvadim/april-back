import { Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';
import {
    timelineLink,
    toTimelineCommentDirect,
} from '@lib/bitrix/consts/timeline.consts';
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
            // ссылки — HTML <a>, переносы — `\n`: `<br>` таймлайн показывает
            // буквально (13.11.2026, сделка april-garant 37760)
            const message = toTimelineCommentDirect([
                timelineLink(link, fileName),
                pdfLink ? timelineLink(pdfLink, pdfFileName) : '',
            ]);

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
