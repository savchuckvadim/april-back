import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupplyReportTemplate } from 'generated/prisma';
import {
    SUPPLY_REPORT_TEMPLATE_PAGE_SIZE,
    type SupplyReportTemplateQueryDto,
} from '../dto/supply-report-template-query.dto';
import {
    SupplyReportTemplatePageDto,
    type SupplyReportTemplateResponseDto,
} from '../dto/supply-report-template-response.dto';
import {
    SupplyReportTemplateFindManyFilters,
    SupplyReportTemplateRepository,
} from '../repositories/supply-report-template.repository';
import {
    buildSupplyReportTemplateBaseUrl,
    buildSupplyReportTemplateUrls,
    filterByTypeLists,
    mapSupplyReportTemplateToResponseDto,
} from '../utils/supply-report-template.mapper';
import { supplyReportTemplateQueryToFilters } from '../utils/supply-report-template.query-filters.util';

/**
 * Чтение шаблонов: поиск по id, страницы списка, сборка DTO со ссылками.
 *
 * Отделено от записи: у чтения своя сложность (две стратегии пагинации в
 * зависимости от фильтров по LongText-спискам), и держать её в одном классе
 * с загрузкой файлов и инвариантами области значило бы выйти за допустимые
 * 200–300 строк.
 *
 * Строка шаблона в этом домене ОПЦИОНАЛЬНА: генерация отчёта берёт .docx из
 * файловой системы, таблица может быть пуста. Поэтому список на пустой
 * таблице — пустая страница, а не ошибка.
 */
@Injectable()
export class SupplyReportTemplateQueryService {
    constructor(
        private readonly repository: SupplyReportTemplateRepository,
        private readonly configService: ConfigService,
    ) {}

    private get baseUrl(): string {
        return buildSupplyReportTemplateBaseUrl(
            this.configService.get<string>('APP_URL'),
        );
    }

    /** Строка → DTO. Все bigint уходят строками: BigInt не сериализуется. */
    toDto(row: SupplyReportTemplate): SupplyReportTemplateResponseDto {
        const baseUrl = this.baseUrl;
        return mapSupplyReportTemplateToResponseDto(row, current =>
            buildSupplyReportTemplateUrls(baseUrl, current),
        );
    }

    /** Строка или 404 — единственная точка, где отсутствие становится ошибкой. */
    async getRowOrFail(id: bigint): Promise<SupplyReportTemplate> {
        const row = await this.repository.findById(id);
        if (!row) {
            throw new NotFoundException(
                `Шаблон отчёта о поставке ${id} не найден`,
            );
        }
        return row;
    }

    async findById(id: bigint): Promise<SupplyReportTemplateResponseDto> {
        return this.toDto(await this.getRowOrFail(id));
    }

    async findMany(
        query: SupplyReportTemplateQueryDto = {},
    ): Promise<SupplyReportTemplatePageDto> {
        return this.findManyWithFilters(
            supplyReportTemplateQueryToFilters(query),
            query,
        );
    }

    /** Общие шаблоны: `portal_id IS NULL`. */
    async findCommon(
        query: SupplyReportTemplateQueryDto = {},
    ): Promise<SupplyReportTemplatePageDto> {
        return this.findMany({
            ...query,
            only_common: true,
            portal_id: undefined,
        });
    }

    /**
     * Шаблоны портала ВМЕСТЕ с общими: портал пользуется и теми, и другими,
     * а список, скрывающий общие, выглядит как «шаблонов нет».
     */
    async findByPortal(
        portalId: bigint,
        query: SupplyReportTemplateQueryDto = {},
    ): Promise<SupplyReportTemplatePageDto> {
        const filters = supplyReportTemplateQueryToFilters({
            ...query,
            only_common: undefined,
            portal_id: undefined,
        });
        filters.portal_id_or_common = portalId;
        return this.findManyWithFilters(filters, query);
    }

    /**
     * Страница списка.
     *
     * При фильтре по `client_type`/`supply_type` страницу нельзя нарезать в
     * SQL: признаки лежат JSON-ом в LongText и отбираются в TypeScript, так
     * что SQL-овый `total` соврал бы, а `take/skip` отрезали бы строки ДО
     * фильтрации. В этом случае берём выборку целиком и режем страницу тут.
     */
    private async findManyWithFilters(
        filters: SupplyReportTemplateFindManyFilters,
        query: SupplyReportTemplateQueryDto,
    ): Promise<SupplyReportTemplatePageDto> {
        const take = query.take ?? SUPPLY_REPORT_TEMPLATE_PAGE_SIZE;
        const skip = query.skip ?? 0;

        if (
            query.client_type === undefined &&
            query.supply_type === undefined
        ) {
            const page = await this.repository.findMany({
                ...filters,
                take,
                skip,
            });
            return this.toPage(page.rows, page.total, take, skip);
        }

        const all = filterByTypeLists(
            await this.repository.findAll(filters),
            query.client_type,
            query.supply_type,
        );
        return this.toPage(
            all.slice(skip, skip + take),
            all.length,
            take,
            skip,
        );
    }

    private toPage(
        rows: SupplyReportTemplate[],
        total: number,
        take: number,
        skip: number,
    ): SupplyReportTemplatePageDto {
        const page = new SupplyReportTemplatePageDto();
        page.items = rows.map(row => this.toDto(row));
        page.total = total;
        page.take = take;
        page.skip = skip;
        return page;
    }
}
