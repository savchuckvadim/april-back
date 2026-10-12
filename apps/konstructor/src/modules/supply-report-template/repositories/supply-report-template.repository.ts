import type { Prisma, SupplyReportTemplate } from 'generated/prisma';

/**
 * Клиент Prisma, пригодный и как корневой сервис, и как транзакционный.
 *
 * `create` + «снять is_default у остальных области» — две записи, которые
 * обязаны быть атомарны: падение между ними оставляет в области либо два
 * шаблона по умолчанию, либо ни одного. Поэтому транзакция живёт в
 * репозитории, а не в сервисе — иначе инфраструктура протекает в домен и
 * юнит-тест сервиса потребовал бы моков Prisma.
 */
export type SupplyReportTemplateTxClient = Prisma.TransactionClient;

/**
 * Фильтры выборки списка.
 *
 * `portal_id`/`agent_id` допускают `null` КАК ЗНАЧЕНИЕ: «только общие»
 * (`portal_id IS NULL`) — это отдельный запрос, а не отсутствие фильтра.
 * Отсутствие фильтра выражается `undefined`.
 *
 * Фильтра по `contract_type` здесь нет: у `supply_report_templates` такой
 * колонки не существует.
 *
 * Полей `client_types`/`supply_types` здесь тоже НЕТ намеренно: они лежат
 * JSON-ом в LongText, у Prisma нет операций по массивам в строковой
 * колонке, а сырой SQL в проекте запрещён. Эти два признака фильтруются
 * в TypeScript ПОСЛЕ выборки — см. `supply-report-template.mapper.ts`.
 */
export type SupplyReportTemplateFindManyFilters = {
    portal_id?: bigint | null;
    /**
     * Портал ИЛИ общие (`portal_id IN (x, NULL)`) — выборка для админки
     * портала: ей нужны и свои шаблоны, и унаследованные общие.
     * Взаимоисключим с `portal_id`.
     */
    portal_id_or_common?: bigint;
    agent_id?: bigint | null;
    is_active?: boolean;
    is_archived?: boolean;
    search?: string;
    take?: number;
    skip?: number;
};

/** Страница строк: total считается тем же where, что и выборка. */
export type SupplyReportTemplatePage = {
    rows: SupplyReportTemplate[];
    total: number;
};

export abstract class SupplyReportTemplateRepository {
    abstract findById(id: bigint): Promise<SupplyReportTemplate | null>;
    abstract findMany(
        filters: SupplyReportTemplateFindManyFilters,
    ): Promise<SupplyReportTemplatePage>;
    /**
     * Выборка без пагинации — для случаев, когда результат ещё предстоит
     * отфильтровать в TypeScript по `client_types`/`supply_types`: считать
     * `total` в SQL там нельзя, иначе он соврёт, а `take/skip` отрезали бы
     * строки ДО фильтрации.
     */
    abstract findAll(
        filters: SupplyReportTemplateFindManyFilters,
    ): Promise<SupplyReportTemplate[]>;
    abstract create(
        data: Prisma.SupplyReportTemplateCreateInput,
        tx?: SupplyReportTemplateTxClient,
    ): Promise<SupplyReportTemplate>;
    abstract update(
        id: bigint,
        data: Prisma.SupplyReportTemplateUpdateInput,
        tx?: SupplyReportTemplateTxClient,
    ): Promise<SupplyReportTemplate>;
    abstract delete(id: bigint): Promise<void>;
    abstract updateMany(
        where: Prisma.SupplyReportTemplateWhereInput,
        data: Prisma.SupplyReportTemplateUpdateManyMutationInput,
        tx?: SupplyReportTemplateTxClient,
    ): Promise<number>;
    /** Выполнить набор операций в одной транзакции. */
    abstract runInTransaction<T>(
        fn: (tx: SupplyReportTemplateTxClient) => Promise<T>,
    ): Promise<T>;
}
