import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { UserNamesReader } from '../ai-analytics/domain/loaders/user-names.reader';
import { fallbackAuthorName } from './portal-view.util';

/**
 * Имя сотрудника «Фамилия Имя» для подписи «кто менял последним».
 *
 * Инстанс Битрикса — только на время чтения (`PBXService.init(domain)`), в
 * сервисе не хранится. Имя не прочиталось — «Сотрудник № id»: сохранение
 * настроек из-за подписи не срывается.
 */
@Injectable()
export class PortalViewAuthorReader {
    private readonly logger = new Logger(PortalViewAuthorReader.name);

    constructor(private readonly pbx: PBXService) {}

    async nameOf(domain: string, userId: string): Promise<string> {
        try {
            const { bitrix } = await this.pbx.init(domain);
            const names = await new UserNamesReader(bitrix).read([userId]);
            return (
                names.get(String(Number(userId))) ?? fallbackAuthorName(userId)
            );
        } catch (error) {
            this.logger.warn(
                `Имя сотрудника ${userId} портала ${domain} не прочитано: ${(error as Error).message}`,
            );
            return fallbackAuthorName(userId);
        }
    }
}
