import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GarantFeedImportService } from '../services/garant-feed-import.service';
import {
    GarantFeedImportRequestDto,
    GarantFeedImportResponseDto,
} from '../dto/garant-feed-import.dto';

/**
 * Импорт каталога «Гарант» из Google-фида цен (легаси-таблица владельца).
 * Контроллер живёт только в админке (ai/rules/app-api-surface.md).
 */
@ApiTags('Admin Garant Feed Import')
@Controller('admin/garant/import')
export class GarantFeedImportAdminController {
    constructor(private readonly importService: GarantFeedImportService) {}

    @Post('google')
    @ApiOperation({
        summary: 'Импортировать каталог из Google-фида цен',
        description:
            'Тянет легаси-фид (env GARANT_FEED_URL) и обновляет выбранные секции: ' +
            'рабсы регионов, цены prof-линейки, цены LT/СТАР. Опционально досоздаёт ' +
            'отсутствующие справочники (поставки, универсальные комплекты, пакеты услуг). ' +
            'dryRun=true считает изменения без записи.',
    })
    @ApiBody({
        type: GarantFeedImportRequestDto,
        description:
            'Выбор секций импорта (sections), сидов справочников (seed) и флага пробного прогона (dryRun).',
    })
    @ApiOkResponse({
        description: 'Отчёт импорта по секциям.',
        type: GarantFeedImportResponseDto,
    })
    async importFromGoogle(
        @Body() dto: GarantFeedImportRequestDto,
    ): Promise<GarantFeedImportResponseDto> {
        const sections = dto.sections ?? [];
        const seed = dto.seed ?? [];
        if (sections.length === 0 && seed.length === 0) {
            throw new BadRequestException(
                'Выберите хотя бы одну секцию импорта (sections) или сид (seed)',
            );
        }
        try {
            return await this.importService.run({
                sections,
                seed,
                dryRun: dto.dryRun ?? false,
            });
        } catch (error) {
            throw new BadRequestException(
                error instanceof Error
                    ? error.message
                    : 'Не удалось выполнить импорт фида',
            );
        }
    }
}
