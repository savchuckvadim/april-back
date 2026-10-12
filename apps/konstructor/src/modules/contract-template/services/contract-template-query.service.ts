import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ContractTemplate } from 'generated/prisma';
import {
    CONTRACT_TEMPLATE_PAGE_SIZE,
    type ContractTemplateQueryDto,
} from '../dto/contract-template-query.dto';
import type { ContractTemplateResponseDto } from '../dto/contract-template-response.dto';
import { ContractTemplatePageDto } from '../dto/contract-template-response.dto';
import {
    ContractTemplateFindManyFilters,
    ContractTemplateRepository,
} from '../repositories/contract-template.repository';
import {
    buildContractTemplateBaseUrl,
    mapContractTemplateToResponseDto,
} from '../utils/contract-template.mapper';
import {
    filterByTemplateLists,
    type TemplateListFilter,
} from '../utils/contract-template.prisma-where.util';

/** Метаданные файла для скачивания. */
export type ContractTemplateFileMeta = {
    file_path: string;
    name: string;
};

/**
 * Чтение шаблонов договора: поиск по id, списки, пагинация, сборка DTO.
 *
 * Отделено от команд (`ContractTemplateService`): у чтения и записи разные
 * причины меняться — чтению важны фильтры и пагинация, записи — инварианты
 * области и транзакции. Один класс на двоих выходил за лимит 200–300 строк
 * из CLAUDE.md.
 */
@Injectable()
export class ContractTemplateQueryService {
    constructor(
        private readonly repository: ContractTemplateRepository,
        private readonly configService: ConfigService,
    ) {}

    private get baseUrl(): string {
        return buildContractTemplateBaseUrl(
            this.configService.get<string>('APP_URL'),
        );
    }

    public toDto(row: ContractTemplate): ContractTemplateResponseDto {
        return mapContractTemplateToResponseDto(row, this.baseUrl);
    }

    /** Строка или 404. Используется и командами — инвариант «шаблон есть». */
    async getEntityOrFail(id: bigint): Promise<ContractTemplate> {
        const row = await this.repository.findById(id);
        if (!row) {
            throw new NotFoundException(`Шаблон договора ${id} не найден`);
        }
        return row;
    }

    async findById(id: bigint): Promise<ContractTemplateResponseDto> {
        return this.toDto(await this.getEntityOrFail(id));
    }

    /**
     * Страница списка.
     *
     * Когда задан фильтр по `client_type`/`supply_type`, страницу нельзя
     * нарезать в SQL: эти признаки лежат JSON-ом в LongText и отбираются
     * в TypeScript, так что SQL-овый `total` соврал бы (а `take/skip`
     * отрезали бы строки до фильтрации). В этом случае берём выборку
     * целиком, фильтруем и нарезаем страницу уже здесь.
     */
    async findMany(
        query: ContractTemplateQueryDto = {},
    ): Promise<ContractTemplatePageDto> {
        return this.findManyWithFilters(this.buildFilters(query), query);
    }

    /** Общие шаблоны: `portal_id IS NULL`. */
    async findCommon(
        query: ContractTemplateQueryDto = {},
    ): Promise<ContractTemplatePageDto> {
        return this.findMany({ ...query, only_common: true });
    }

    /**
     * Шаблоны портала ВМЕСТЕ с общими: портал реально пользуется и теми, и
     * другими, а список, скрывающий общие, выглядит как «шаблонов нет».
     * Чужие поставщики сюда не попадают — фильтр по порталу их исключает.
     */
    async findByPortal(
        portalId: bigint,
        query: ContractTemplateQueryDto = {},
    ): Promise<ContractTemplatePageDto> {
        const filters = this.buildFilters(query);
        delete filters.portal_id;
        delete filters.only_common;
        filters.portal_id_or_common = portalId;
        return this.findManyWithFilters(filters, query);
    }

    /** Метаданные файла для скачивания — используется download-сервисом. */
    async getFileForDownload(
        id: bigint,
        demo = false,
    ): Promise<ContractTemplateFileMeta> {
        const row = await this.getEntityOrFail(id);
        const path = demo ? row.demo_path : row.file_path;
        if (!path) {
            throw new NotFoundException(
                demo
                    ? 'Демонстрационный файл не загружен'
                    : 'Файл шаблона не задан',
            );
        }
        return { file_path: path, name: row.name };
    }

    buildFilters(
        query: ContractTemplateQueryDto,
    ): ContractTemplateFindManyFilters {
        const filters: ContractTemplateFindManyFilters = {};
        if (query.only_common) {
            filters.only_common = true;
        } else if (query.portal_id !== undefined) {
            filters.portal_id = BigInt(query.portal_id);
        }
        if (query.agent_id !== undefined) {
            filters.agent_id = BigInt(query.agent_id);
        }
        if (query.contract_type !== undefined) {
            filters.contract_type = query.contract_type;
        }
        if (query.is_active !== undefined) {
            filters.is_active = query.is_active;
        }
        // Архивные скрыты по умолчанию: админке нужен рабочий список.
        filters.is_archived = query.is_archived ?? false;
        if (query.search) {
            filters.search = query.search;
        }
        return filters;
    }

    async findManyWithFilters(
        filters: ContractTemplateFindManyFilters,
        query: ContractTemplateQueryDto,
    ): Promise<ContractTemplatePageDto> {
        const take = query.take ?? CONTRACT_TEMPLATE_PAGE_SIZE;
        const skip = query.skip ?? 0;
        const listFilter: TemplateListFilter = {};
        if (query.client_type !== undefined) {
            listFilter.client_type = query.client_type;
        }
        if (query.supply_type !== undefined) {
            listFilter.supply_type = query.supply_type;
        }

        if (
            listFilter.client_type === undefined &&
            listFilter.supply_type === undefined
        ) {
            const page = await this.repository.findMany(filters, {
                take,
                skip,
            });
            return this.toPage(page.rows, page.total, take, skip);
        }

        const all = filterByTemplateLists(
            await this.repository.findAll(filters),
            listFilter,
        );
        return this.toPage(
            all.slice(skip, skip + take),
            all.length,
            take,
            skip,
        );
    }

    private toPage(
        rows: ContractTemplate[],
        total: number,
        take: number,
        skip: number,
    ): ContractTemplatePageDto {
        const page = new ContractTemplatePageDto();
        page.items = rows.map(row => this.toDto(row));
        page.total = total;
        page.take = take;
        page.skip = skip;
        return page;
    }
}
