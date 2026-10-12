import type { ContractTemplate, Prisma } from 'generated/prisma';
import type { CONTRACT_LTYPE } from '../dto/contract-template.enums';

/**
 * Клиент Prisma, пригодный и как корневой сервис, и как транзакционный.
 *
 * `create` + «снять is_default у остальных» — это две записи, которые должны
 * быть атомарны: иначе при падении между ними в области остаётся либо два
 * шаблона по умолчанию, либо ни одного. Абстрактный репозиторий шаблонов
 * счёта такой возможности не даёт (`invoice-template.repository.ts` вообще
 * не принимает транзакционный клиент) — здесь она есть.
 */
export type ContractTemplateTxClient = Prisma.TransactionClient;

/**
 * Фильтры выборки. Полей `client_types`/`supply_types` здесь НЕТ намеренно:
 * они лежат JSON-ом в LongText, у Prisma нет операций по массивам в
 * строковой колонке, а сырой SQL в проекте запрещён. Эти два признака
 * фильтруются в TypeScript ПОСЛЕ выборки — см.
 * `contract-template.prisma-where.util.ts`.
 */
export type ContractTemplateFindManyFilters = {
    /** Конкретный портал. Взаимоисключим с `only_common`. */
    portal_id?: bigint;
    /** Только общие шаблоны: `portal_id IS NULL`. */
    only_common?: boolean;
    /**
     * Портал ИЛИ общие (`portal_id IN (x, NULL)`) — выборка для админки
     * портала: ей нужны и свои шаблоны, и унаследованные общие.
     */
    portal_id_or_common?: bigint;
    agent_id?: bigint;
    /** Колонка `contract_type` есть ТОЛЬКО у `contract_templates`. */
    contract_type?: CONTRACT_LTYPE;
    is_active?: boolean;
    is_archived?: boolean;
    search?: string;
};

export type ContractTemplatePagination = {
    take: number;
    skip: number;
};

export type ContractTemplatePage = {
    rows: ContractTemplate[];
    total: number;
};

export abstract class ContractTemplateRepository {
    /**
     * Страница списка вместе с `total`. Без `total` таблица в админке не
     * знает числа страниц — ровно этого не хватает списку шаблонов счёта.
     */
    abstract findMany(
        filters: ContractTemplateFindManyFilters,
        pagination?: ContractTemplatePagination,
    ): Promise<ContractTemplatePage>;

    /**
     * Выборка без пагинации — для случаев, когда результат ещё предстоит
     * отфильтровать в TypeScript по `client_types`/`supply_types`:
     * считать `total` в SQL там нельзя, иначе он соврёт.
     */
    abstract findAll(
        filters: ContractTemplateFindManyFilters,
    ): Promise<ContractTemplate[]>;

    abstract findById(id: bigint): Promise<ContractTemplate | null>;

    abstract create(
        data: Prisma.ContractTemplateCreateInput,
        tx?: ContractTemplateTxClient,
    ): Promise<ContractTemplate>;

    abstract update(
        id: bigint,
        data: Prisma.ContractTemplateUpdateInput,
        tx?: ContractTemplateTxClient,
    ): Promise<ContractTemplate>;

    abstract updateMany(
        where: Prisma.ContractTemplateWhereInput,
        data: Prisma.ContractTemplateUpdateManyMutationInput,
        tx?: ContractTemplateTxClient,
    ): Promise<number>;

    abstract delete(id: bigint): Promise<void>;

    /**
     * Выполнить набор операций в одной транзакции. Вынесено в репозиторий,
     * чтобы сервис не зависел от PrismaService напрямую (иначе инфраструктура
     * протекает в доменный слой и юнит-тест сервиса требует моков Prisma).
     */
    abstract runInTransaction<T>(
        fn: (tx: ContractTemplateTxClient) => Promise<T>,
    ): Promise<T>;
}
