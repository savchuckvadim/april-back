import { Injectable, Logger } from '@nestjs/common';
import { PortalViewReader } from '../../portal-view';
import type { ShareLinkPublicViewDto } from '../dto/share-link.dto';

/**
 * Вид отчёта портала для публичной ссылки: свои названия показателей,
 * прочитанные в момент открытия (в снимке их нет — переименование видно
 * сразу, без пересборки снимка). Ошибка чтения настроек ссылку не ломает:
 * в журнал — предупреждение, на страницу — исходные названия.
 */
@Injectable()
export class ShareLinkViewReader {
    private readonly logger = new Logger(ShareLinkViewReader.name);

    constructor(private readonly portalView: PortalViewReader) {}

    async read(domain: string): Promise<ShareLinkPublicViewDto> {
        try {
            return { labels: await this.portalView.labels(domain) };
        } catch (error) {
            this.logger.warn(
                `Свои названия показателей портала ${domain} для публичной ссылки не прочитаны: ${(error as Error).message}`,
            );
            return { labels: {} };
        }
    }
}
