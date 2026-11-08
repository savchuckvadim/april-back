import {
    Body,
    Controller,
    Get,
    HttpCode,
    NotFoundException,
    Param,
    Post,
    Put,
} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBody,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '@lib/auth';
import { VendorSettingsService } from '@lib/portal-lib/store/vendor-settings/vendor-settings.service';
import { VENDOR_SETTING_KEYS, isVendorSettingKey } from '@lib/vendor-settings';
import {
    UpdateVendorSettingDto,
    VendorSettingDto,
    VendorSettingsResponseDto,
} from './dto/vendor-settings.dto';
import {
    VendorTelegramBotsResponseDto,
    VendorTelegramBotTestDto,
    VendorTelegramBotTestResultDto,
} from './dto/vendor-telegram-bots.dto';
import { VendorTelegramBotsService } from './services/vendor-telegram-bots.service';
import { VendorTelegramBotTestService } from './services/vendor-telegram-bot-test.service';
import {
    isTelegramBotKey,
    TELEGRAM_BOT_KEYS,
} from './services/telegram-bots.catalog';

/**
 * Настройки приложения уровня вендора (April): исходящий прокси за рубеж и
 * ключи AI-сервисов. Значение из админки важнее переменной окружения с тем
 * же именем, применяется в течение минуты без выкладки. Секреты хранятся
 * зашифрованными и наружу не отдаются.
 */
@ApiTags('Admin Vendor Settings')
@Controller('admin/vendor-settings')
export class VendorSettingsController {
    constructor(
        private readonly service: VendorSettingsService,
        private readonly telegramBotsCheck: VendorTelegramBotsService,
        private readonly telegramBotTest: VendorTelegramBotTestService,
    ) {}

    @Get()
    @ApiOperation({
        summary: 'Настройки приложения по группам',
        description:
            'Все настройки реестра с описанием, инструкцией «где взять» и тем, что действует сейчас: админка, окружение или ничего.',
    })
    @ApiOkResponse({
        type: VendorSettingsResponseDto,
        description: 'Группы настроек с текущим состоянием.',
    })
    async list(): Promise<VendorSettingsResponseDto> {
        return new VendorSettingsResponseDto(await this.service.list());
    }

    @Get('telegram-bots')
    @ApiOperation({
        summary: 'Какие Telegram-боты подключены',
        description:
            'Для каждого бота April (клиентский, поддержка, тревоги разработчика) — какой бот на самом деле стоит в токене (имя по ответу Telegram), почему проверка не прошла и не вставлен ли один токен в два места. Токены наружу не отдаются.',
    })
    @ApiOkResponse({
        type: VendorTelegramBotsResponseDto,
        description: 'Проверка всех Telegram-ботов.',
    })
    async telegramBots(): Promise<VendorTelegramBotsResponseDto> {
        return new VendorTelegramBotsResponseDto(
            await this.telegramBotsCheck.check(),
        );
    }

    @Post('telegram-bots/:key/test')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Тестовое сообщение через бота',
        description:
            'Поддержка — в чат поддержки, тревоги — в TELEGRAM_ADMIN_CHAT_ID, либо в указанный chat id. Клиентского бота проверяют у привязанного чата в карточке портала. Не доставлено — причина по-русски.',
    })
    @ApiParam({
        name: 'key',
        description: 'Бот — имя настройки или переменной с его токеном.',
        enum: TELEGRAM_BOT_KEYS,
        example: 'SUPPORT_TELEGRAM_BOT_TOKEN',
    })
    @ApiBody({
        type: VendorTelegramBotTestDto,
        description: 'Куда отправить (необязательно).',
    })
    @ApiOkResponse({
        type: VendorTelegramBotTestResultDto,
        description: 'Итог отправки.',
    })
    @ApiNotFoundResponse({ description: 'Такого бота нет.' })
    async testTelegramBot(
        @Param('key') key: string,
        @Body() dto: VendorTelegramBotTestDto,
    ): Promise<VendorTelegramBotTestResultDto> {
        if (!isTelegramBotKey(key)) {
            throw new NotFoundException(`Бота «${key}» нет`);
        }
        return this.telegramBotTest.send(key, dto.chatId);
    }

    @Put(':key')
    @ApiOperation({
        summary: 'Сохранить настройку',
        description:
            'Пустое значение снимает настройку из админки — снова действует переменная окружения. Для секрета маска означает «оставить прежнее». Значение проверяется: адрес прокси должен быть полным https-адресом, хосты — именами через запятую.',
    })
    @ApiParam({
        name: 'key',
        description: 'Ключ настройки из реестра.',
        enum: VENDOR_SETTING_KEYS,
        example: 'GROQ_API_KEY',
    })
    @ApiBody({
        type: UpdateVendorSettingDto,
        description:
            'Новое значение настройки: пусто или null — снять, маска секрета — оставить прежнее.',
    })
    @ApiOkResponse({
        type: VendorSettingDto,
        description: 'Настройка после сохранения.',
    })
    @ApiBadRequestResponse({
        description:
            'Значение не прошло проверку реестра: кривой адрес прокси или мусор в списке хостов.',
    })
    @ApiNotFoundResponse({
        description: 'Такого ключа нет в реестре настроек.',
    })
    async update(
        @Param('key') key: string,
        @Body() dto: UpdateVendorSettingDto,
        @CurrentUser('login') login?: string,
    ): Promise<VendorSettingDto> {
        if (!isVendorSettingKey(key)) {
            throw new NotFoundException(`Настройки «${key}» нет в реестре`);
        }
        return new VendorSettingDto(
            await this.service.save(key, dto.value ?? null, login ?? null),
        );
    }
}
