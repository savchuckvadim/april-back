import { Injectable, Logger } from '@nestjs/common';
import { TelegramUpdateDto } from './dto/telegram-update.dto';

/**
 * Сервис Telegram-бота (шаблон).
 *
 * Здесь живут сценарии и кнопки канала Telegram: приём update, опрос
 * пользователя, сбор предданных и (в будущем) передача в профильные приложения.
 * Реальную интеграцию можно строить на библиотеке @lib/telegram.
 */
@Injectable()
export class TelegramBotService {
    private readonly logger = new Logger(TelegramBotService.name);

    handleUpdate(update: TelegramUpdateDto): void {
        this.logger.log(
            `Telegram-бот: update ${update.updateId} из чата ${update.chatId}`,
        );
        // TODO: маршрутизация по сценариям бота и сбор предданных.
    }
}
