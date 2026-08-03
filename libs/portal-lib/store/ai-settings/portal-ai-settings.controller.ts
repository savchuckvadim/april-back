import {
    Body,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Put,
} from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { PortalAiSettingsService } from './portal-ai-settings.service';
import {
    PortalAiSettingsResponseDto,
    UpdatePortalAiSettingsDto,
} from './dto/portal-ai-settings.dto';

/**
 * Настройки AI-отчётности по звонкам на конкретный портал.
 *
 * Все поля опциональны: незаданное значение означает, что портал работает
 * на глобальных настройках приложения. Поэтому GET на портале без настроек
 * отдаёт заполненный null'ами объект, а не 404 — админке нужно показать
 * форму с пустыми полями и подсказками о глобальных значениях.
 */
@ApiTags('Admin Portal AI Settings')
@Controller('admin/portal/:portalId/ai-settings')
export class PortalAiSettingsController {
    constructor(private readonly service: PortalAiSettingsService) {}

    @Get()
    @ApiOperation({
        summary: 'Настройки AI портала',
        description:
            'Возвращает переопределения портала. null в поле означает, что ' +
            'используется глобальная настройка приложения.',
    })
    @ApiParam({ name: 'portalId', type: Number, example: 5 })
    @ApiOkResponse({
        type: PortalAiSettingsResponseDto,
        description: 'Текущие настройки портала (незаданные поля — null).',
    })
    async get(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<PortalAiSettingsResponseDto> {
        const record = await this.service.get(portalId);
        return new PortalAiSettingsResponseDto(record);
    }

    @Put()
    @ApiOperation({
        summary: 'Сохранить настройки AI портала',
        description:
            'Обновляет только переданные поля. Явный null сбрасывает ' +
            'переопределение — портал возвращается на глобальную настройку.',
    })
    @ApiParam({ name: 'portalId', type: Number, example: 5 })
    @ApiBody({
        type: UpdatePortalAiSettingsDto,
        description: 'Изменяемые настройки (все поля опциональны).',
    })
    @ApiOkResponse({
        type: PortalAiSettingsResponseDto,
        description: 'Настройки после сохранения.',
    })
    async update(
        @Param('portalId', ParseIntPipe) portalId: number,
        @Body() dto: UpdatePortalAiSettingsDto,
    ): Promise<PortalAiSettingsResponseDto> {
        const saved = await this.service.save(portalId, dto);
        return new PortalAiSettingsResponseDto(saved);
    }
}
