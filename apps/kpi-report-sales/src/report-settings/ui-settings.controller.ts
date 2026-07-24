import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    UiSettingsGetRequestDto,
    UiSettingsGetResponseDto,
    UiSettingsSaveRequestDto,
    UiSettingsSaveResponseDto,
} from './dto/ui-settings.dto';
import { ReportSettingsService } from './report-settings.service';

/**
 * UI-настройки KPI-отчёта (кросс-браузерный синк: localStorage — кэш,
 * бэк — источник истины). Хранение — колонка `other` report_settings,
 * логический ключ portalId + bxUserId.
 */
@ApiTags('Sales Report UI Settings')
@Controller('kpi-report/ui-settings')
export class UiSettingsController {
    constructor(private readonly settings: ReportSettingsService) {}

    @Post('get')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сохранённые UI-настройки пользователя',
        description:
            'Возвращает непрозрачный JSON-блоб UI-настроек фронта (конверсии, видимость блоков, локальные фильтры) и дату последнего сохранения.',
    })
    @ApiOkResponse({ type: UiSettingsGetResponseDto })
    async getUiSettings(
        @Body() dto: UiSettingsGetRequestDto,
    ): Promise<UiSettingsGetResponseDto> {
        return this.settings.getUiSettings(dto.domain, dto.userId);
    }

    @Post('save')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сохранить UI-настройки пользователя',
        description:
            'Перезаписывает блоб целиком (last-write-wins). Формат версионирует фронт.',
    })
    @ApiOkResponse({ type: UiSettingsSaveResponseDto })
    async saveUiSettings(
        @Body() dto: UiSettingsSaveRequestDto,
    ): Promise<UiSettingsSaveResponseDto> {
        await this.settings.saveUiSettings(
            dto.domain,
            dto.userId,
            dto.settings,
        );
        return { saved: true };
    }
}
