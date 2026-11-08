import {
    Body,
    Controller,
    Get,
    NotFoundException,
    Param,
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
import { VendorTelegramBotsResponseDto } from './dto/vendor-telegram-bots.dto';
import { VendorTelegramBotsService } from './services/vendor-telegram-bots.service';

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
