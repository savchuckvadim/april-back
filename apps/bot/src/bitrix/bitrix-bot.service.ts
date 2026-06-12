import { Injectable, Logger } from '@nestjs/common';
import { BitrixBotEventDto } from './dto/bitrix-bot-event.dto';

/**
 * Сервис Bitrix-бота (шаблон).
 *
 * Здесь живут сценарии и кнопки канала Bitrix: приём события, опрос
 * пользователя, сбор предданных и (в будущем) передача в профильные приложения.
 * Доступ к Bitrix — только через инстанс по domain (PBXService из @lib/pbx),
 * без this.bitrix в Injectable-сервисе (см. CLAUDE.md).
 */
@Injectable()
export class BitrixBotService {
    private readonly logger = new Logger(BitrixBotService.name);

    handleEvent(event: BitrixBotEventDto): void {
        this.logger.log(
            `Bitrix-бот: событие ${event.event} с портала ${event.domain}`,
        );
        // TODO: маршрутизация по сценариям бота и сбор предданных.
    }
}
