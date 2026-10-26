import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CatalogSeedService } from '../services/catalog-seed.service';
import {
    CatalogSeedRequestDto,
    TableImportReportDto,
} from '../../catalog-table/dto/catalog-table.dto';

/**
 * Сид чистого каталога «Гарант»: разовое наполнение справочников
 * константной сеткой (коды поставок, универсальная линейка, пакеты услуг).
 * Цены и тексты заливаются эталонными таблицами.
 */
@ApiTags('Admin Garant Catalog Seed')
@Controller('admin/garant/seed')
export class CatalogSeedAdminController {
    constructor(private readonly seedService: CatalogSeedService) {}

    @Post()
    @ApiOperation({
        summary: 'Создать отсутствующие справочники каталога',
        description:
            'Досоздаёт то, чего нет: сетку видов поставок (коды internet_*/proxima_*), ' +
            'универсальные комплекты с рабсами, пакеты LegalTech/СТАР/консалтинга. ' +
            'Существующие записи не изменяются. dryRun=true только показывает план.',
    })
    @ApiBody({
        type: CatalogSeedRequestDto,
        description: 'Список секций и флаг пробного прогона.',
    })
    @ApiOkResponse({
        description: 'Отчёты по секциям: создано, уже было, пропущено.',
        type: [TableImportReportDto],
    })
    async seed(
        @Body() dto: CatalogSeedRequestDto,
    ): Promise<TableImportReportDto[]> {
        if (dto.sections.length === 0) {
            throw new BadRequestException('Выберите хотя бы одну секцию сида');
        }
        const dryRun = dto.dryRun ?? false;
        const reports: TableImportReportDto[] = [];
        if (dto.sections.includes('supplies')) {
            reports.push(await this.seedService.seedSupplies(dryRun));
        }
        if (dto.sections.includes('universalComplects')) {
            reports.push(await this.seedService.seedUniversalComplects(dryRun));
        }
        if (dto.sections.includes('servicePackages')) {
            reports.push(await this.seedService.seedServicePackages(dryRun));
        }
        return reports;
    }
}
