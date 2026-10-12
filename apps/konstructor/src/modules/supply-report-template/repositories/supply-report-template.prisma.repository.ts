import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import type { Prisma, SupplyReportTemplate } from 'generated/prisma';
import {
    SupplyReportTemplateFindManyFilters,
    SupplyReportTemplatePage,
    SupplyReportTemplateRepository,
    SupplyReportTemplateTxClient,
} from './supply-report-template.repository';
import {
    SUPPLY_REPORT_TEMPLATE_PAGE_SIZE,
    SUPPLY_REPORT_TEMPLATE_PAGE_SIZE_MAX,
} from '../dto/supply-report-template-query.dto';
import { buildSupplyReportTemplateWhere } from '../utils/supply-report-template.prisma-where.util';

/**
 * У `SupplyReportTemplate` в схеме НЕТ Prisma-связей на `Portal`/`agents`
 * (в отличие от `InvoiceTemplate`), поэтому ни `include`, ни
 * `connect/disconnect` тут неприменимы — пишутся скалярные
 * `portal_id`/`agent_id`. Инвариант «агент принадлежит порталу» БД не
 * держит, его проверяет сервис.
 */
@Injectable()
export class SupplyReportTemplatePrismaRepository extends SupplyReportTemplateRepository {
    constructor(private readonly prisma: PrismaService) {
        super();
    }

    /** Сортировка: сначала «по умолчанию», затем свежие. */
    private get orderBy(): Prisma.SupplyReportTemplateOrderByWithRelationInput[] {
        return [{ is_default: 'desc' }, { created_at: 'desc' }, { id: 'desc' }];
    }

    async findById(id: bigint): Promise<SupplyReportTemplate | null> {
        return this.prisma.supplyReportTemplate.findUnique({ where: { id } });
    }

    /**
     * Страница + total одним проходом.
     *
     * `total` считается тем же `where`, что и выборка, и в одной
     * транзакции с ней: иначе между запросами вклинивается запись и total
     * не соответствует отданной странице. У шаблонов счёта пагинации и
     * total нет вообще — здесь этот дефект не повторяется.
     */
    async findMany(
        filters: SupplyReportTemplateFindManyFilters,
    ): Promise<SupplyReportTemplatePage> {
        const where = buildSupplyReportTemplateWhere(filters);
        const take = this.normalizeTake(filters.take);
        const skip = this.normalizeSkip(filters.skip);

        const [rows, total] = await this.prisma.$transaction([
            this.prisma.supplyReportTemplate.findMany({
                where,
                orderBy: this.orderBy,
                take,
                skip,
            }),
            this.prisma.supplyReportTemplate.count({ where }),
        ]);

        return { rows, total };
    }

    async findAll(
        filters: SupplyReportTemplateFindManyFilters,
    ): Promise<SupplyReportTemplate[]> {
        return this.prisma.supplyReportTemplate.findMany({
            where: buildSupplyReportTemplateWhere(filters),
            orderBy: this.orderBy,
        });
    }

    async create(
        data: Prisma.SupplyReportTemplateCreateInput,
        tx?: SupplyReportTemplateTxClient,
    ): Promise<SupplyReportTemplate> {
        const client = tx ?? this.prisma;
        return client.supplyReportTemplate.create({ data });
    }

    async update(
        id: bigint,
        data: Prisma.SupplyReportTemplateUpdateInput,
        tx?: SupplyReportTemplateTxClient,
    ): Promise<SupplyReportTemplate> {
        const client = tx ?? this.prisma;
        return client.supplyReportTemplate.update({ where: { id }, data });
    }

    async delete(id: bigint): Promise<void> {
        await this.prisma.supplyReportTemplate.delete({ where: { id } });
    }

    async updateMany(
        where: Prisma.SupplyReportTemplateWhereInput,
        data: Prisma.SupplyReportTemplateUpdateManyMutationInput,
        tx?: SupplyReportTemplateTxClient,
    ): Promise<number> {
        const client = tx ?? this.prisma;
        const result = await client.supplyReportTemplate.updateMany({
            where,
            data,
        });
        return result.count;
    }

    async runInTransaction<T>(
        fn: (tx: SupplyReportTemplateTxClient) => Promise<T>,
    ): Promise<T> {
        return this.prisma.$transaction(tx => fn(tx));
    }

    /**
     * DTO уже ограничивает take/skip, но репозиторий вызывается и изнутри
     * (findCommon/findByPortal), поэтому потолок держится и здесь:
     * выборка без лимита — это запрос всей таблицы.
     */
    private normalizeTake(take?: number): number {
        if (take == null || !Number.isFinite(take) || take <= 0) {
            return SUPPLY_REPORT_TEMPLATE_PAGE_SIZE;
        }
        return Math.min(Math.floor(take), SUPPLY_REPORT_TEMPLATE_PAGE_SIZE_MAX);
    }

    private normalizeSkip(skip?: number): number {
        if (skip == null || !Number.isFinite(skip) || skip <= 0) {
            return 0;
        }
        return Math.floor(skip);
    }
}
