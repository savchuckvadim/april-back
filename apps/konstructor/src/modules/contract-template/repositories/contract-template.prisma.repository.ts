import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import type { ContractTemplate, Prisma } from 'generated/prisma';
import {
    ContractTemplateFindManyFilters,
    ContractTemplatePage,
    ContractTemplatePagination,
    ContractTemplateRepository,
    ContractTemplateTxClient,
} from './contract-template.repository';
import { buildContractTemplateWhere } from '../utils/contract-template.prisma-where.util';

/**
 * Prisma-реализация. Вся сборка `where` вынесена в
 * `contract-template.prisma-where.util.ts`, чтобы её можно было покрыть
 * юнит-тестом без поднятого Prisma — у шаблонов счёта `where` собирается
 * внутри репозитория и потому непроверяема.
 *
 * `include: { portal: true, agent: true }` здесь НЕТ: у `ContractTemplate`
 * нет Prisma-связей (ни `portal`, ни `agent` — в отличие от
 * `InvoiceTemplate`), привязка выражена сырыми колонками `portal_id` /
 * `agent_id` без FK в БД. Поэтому и запись идёт скалярами, а не
 * `connect`/`disconnect`.
 */
@Injectable()
export class ContractTemplatePrismaRepository extends ContractTemplateRepository {
    constructor(private readonly prisma: PrismaService) {
        super();
    }

    /** Сортировка: сначала «по умолчанию», затем свежие. */
    private get orderBy(): Prisma.ContractTemplateOrderByWithRelationInput[] {
        return [{ is_default: 'desc' }, { created_at: 'desc' }, { id: 'desc' }];
    }

    async findMany(
        filters: ContractTemplateFindManyFilters,
        pagination?: ContractTemplatePagination,
    ): Promise<ContractTemplatePage> {
        const where = buildContractTemplateWhere(filters);

        // Одна транзакция на выборку + count: иначе между запросами может
        // вклиниться запись, и total не будет соответствовать странице.
        const [rows, total] = await this.prisma.$transaction([
            this.prisma.contractTemplate.findMany({
                where,
                orderBy: this.orderBy,
                take: pagination?.take,
                skip: pagination?.skip,
            }),
            this.prisma.contractTemplate.count({ where }),
        ]);

        return { rows, total };
    }

    async findAll(
        filters: ContractTemplateFindManyFilters,
    ): Promise<ContractTemplate[]> {
        return this.prisma.contractTemplate.findMany({
            where: buildContractTemplateWhere(filters),
            orderBy: this.orderBy,
        });
    }

    async findById(id: bigint): Promise<ContractTemplate | null> {
        return this.prisma.contractTemplate.findUnique({ where: { id } });
    }

    async create(
        data: Prisma.ContractTemplateCreateInput,
        tx?: ContractTemplateTxClient,
    ): Promise<ContractTemplate> {
        const client = tx ?? this.prisma;
        return client.contractTemplate.create({ data });
    }

    async update(
        id: bigint,
        data: Prisma.ContractTemplateUpdateInput,
        tx?: ContractTemplateTxClient,
    ): Promise<ContractTemplate> {
        const client = tx ?? this.prisma;
        return client.contractTemplate.update({ where: { id }, data });
    }

    async updateMany(
        where: Prisma.ContractTemplateWhereInput,
        data: Prisma.ContractTemplateUpdateManyMutationInput,
        tx?: ContractTemplateTxClient,
    ): Promise<number> {
        const client = tx ?? this.prisma;
        const result = await client.contractTemplate.updateMany({
            where,
            data,
        });
        return result.count;
    }

    async delete(id: bigint): Promise<void> {
        await this.prisma.contractTemplate.delete({ where: { id } });
    }

    async runInTransaction<T>(
        fn: (tx: ContractTemplateTxClient) => Promise<T>,
    ): Promise<T> {
        return this.prisma.$transaction(tx => fn(tx));
    }
}
