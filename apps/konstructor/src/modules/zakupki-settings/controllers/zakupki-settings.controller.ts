import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    ParseIntPipe,
    Post,
    Query,
} from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import {
    ZakupkiSettingsDeletedDto,
    ZakupkiSettingsDto,
    ZakupkiSettingsSaveDto,
} from '../dto/zakupki-settings.dto';
import { ZakupkiSettingsService } from '../services/zakupki-settings.service';

@ApiTags('KonstructorZakupki')
@Controller('zakupki-settings')
export class ZakupkiSettingsController {
    constructor(private readonly service: ZakupkiSettingsService) {}

    @Get()
    @ApiOperation({
        summary: 'Настройки «3 КП для торгов» пользователя на домене',
        description:
            'Свои настройки → дефолт портала → любая запись домена → создать дефолт. ' +
            'Замена Laravel konstructor/front/zakupki/{domain}/{userId}.',
    })
    @ApiQuery({ name: 'domain', type: String })
    @ApiQuery({ name: 'bxUserId', type: Number })
    @ApiOkResponse({ type: ZakupkiSettingsDto })
    async get(
        @Query('domain') domain: string,
        @Query('bxUserId', ParseIntPipe) bxUserId: number,
    ): Promise<ZakupkiSettingsDto> {
        return this.service.resolve(domain, bxUserId);
    }

    @Post('user')
    @HttpCode(200)
    @ApiOperation({
        summary:
            'Сохранить свои настройки пользователя (создать поверх дефолта или обновить)',
    })
    @ApiBody({ type: ZakupkiSettingsSaveDto })
    @ApiOkResponse({ type: ZakupkiSettingsDto })
    async saveUser(
        @Body() dto: ZakupkiSettingsSaveDto,
    ): Promise<ZakupkiSettingsDto> {
        return this.service.saveForUser(dto);
    }

    @Post('default')
    @HttpCode(200)
    @ApiOperation({ summary: 'Сохранить настройки портала по умолчанию' })
    @ApiBody({ type: ZakupkiSettingsSaveDto })
    @ApiOkResponse({ type: ZakupkiSettingsDto })
    async saveDefault(
        @Body() dto: ZakupkiSettingsSaveDto,
    ): Promise<ZakupkiSettingsDto> {
        return this.service.saveDefault(dto);
    }

    @Delete('user')
    @ApiOperation({
        summary: 'Удалить свои настройки — вернуться к дефолту портала',
    })
    @ApiQuery({ name: 'domain', type: String })
    @ApiQuery({ name: 'bxUserId', type: Number })
    @ApiOkResponse({ type: ZakupkiSettingsDeletedDto })
    async deleteUser(
        @Query('domain') domain: string,
        @Query('bxUserId', ParseIntPipe) bxUserId: number,
    ): Promise<ZakupkiSettingsDeletedDto> {
        return { deleted: await this.service.deleteForUser(domain, bxUserId) };
    }
}
