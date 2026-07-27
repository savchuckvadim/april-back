import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    ReportFilterGetRequestDto,
    ReportFilterGetResponseDto,
    ReportFilterResetResponseDto,
    ReportFilterSaveRequestDto,
    ReportFilterSaveResponseDto,
} from './dto/report-filter.dto';
import { ReportSettingsService } from './report-settings.service';

/**
 * Фильтры KPI-отчёта. Замена legacy Laravel endpoints
 * POST /report/settings/get/filter и POST /report/settings/filter
 * (та же таблица report_settings, см. ReportSettingsService).
 * Эндпоинты открытые, как и остальные в этом приложении.
 */
@ApiTags('Sales Report Filter')
@Controller('kpi-report/filter')
export class ReportSettingsController {
    constructor(private readonly settings: ReportSettingsService) {}

    @Post('get')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сохранённый фильтр отчёта пользователя',
        description:
            'Возвращает фильтр в формате v2. Запись, сохранённую старым фронтом через online API, конвертирует на лету (version=1, selection=null, выбор в legacyUserIds).',
    })
    @ApiOkResponse({ type: ReportFilterGetResponseDto })
    async getFilter(
        @Body() dto: ReportFilterGetRequestDto,
    ): Promise<ReportFilterGetResponseDto> {
        const filter = await this.settings.getFilter(dto.domain, dto.userId);
        return { filter };
    }

    @Post('save')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сохранить фильтр отчёта пользователя',
        description:
            'Сохраняет формат v2 в report_settings.filters и зеркалирует legacy-колонки, чтобы старый флоу через online API продолжал работать.',
    })
    @ApiOkResponse({ type: ReportFilterSaveResponseDto })
    async saveFilter(
        @Body() dto: ReportFilterSaveRequestDto,
    ): Promise<ReportFilterSaveResponseDto> {
        await this.settings.saveFilter(dto.domain, dto.userId, dto.filter);
        return { saved: true };
    }

    @Post('reset')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Аварийный сброс сохранённого фильтра пользователя',
        description:
            'Обнуляет сохранённый фильтр (v2 + legacy-зеркало) — отчёт ' +
            'вернётся к дефолтному периоду. Кейс: сохранён неподъёмный ' +
            'период и отчёт не может догрузиться. UI-настройки (колонка ' +
            'other) не затрагиваются.',
    })
    @ApiOkResponse({ type: ReportFilterResetResponseDto })
    async resetFilter(
        @Body() dto: ReportFilterGetRequestDto,
    ): Promise<ReportFilterResetResponseDto> {
        const reset = await this.settings.resetFilter(dto.domain, dto.userId);
        return { reset };
    }
}
