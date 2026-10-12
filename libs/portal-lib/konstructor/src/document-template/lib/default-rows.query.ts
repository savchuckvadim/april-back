import { PrismaService } from 'src/core/prisma';
import { DocumentTemplateKind } from '../document-template.criteria';
import { TemplateDefaultRow } from '../document-template.repository';

/**
 * Запросы ДИАГНОСТИКИ справочника шаблонов.
 *
 * Вынесено из `DocumentTemplatePrismaRepository`: там это были 110 строк
 * поверх выборки кандидатов, и класс переваливал за лимит 200-300 строк
 * (CLAUDE.md). Разделение не только про размер — у запросов разная задача:
 * выборка кандидатов обслуживает горячий путь генерации документа и
 * ключуется критериями запроса, а эти два запроса обходят справочник
 * целиком ради админки. Репозиторий остаётся единственной публичной
 * точкой входа и просто делегирует сюда.
 *
 * Не `@Injectable`: это деталь реализации репозитория, собственного места
 * в DI-графе ей не нужно — иначе провайдер пришлось бы объявлять и
 * экспортировать в модуле ради класса, который никто больше не инжектит.
 */

/** Строка в том виде, в котором её отдаёт Prisma-select. */
type DefaultRowSelection = {
    id: bigint | string;
    portal_id: bigint | null;
    agent_id: bigint | null;
    contract_type?: string | null;
    client_types: string | null;
    supply_types: string | null;
};

const DEFAULT_ROW_SELECT = {
    id: true,
    portal_id: true,
    agent_id: true,
    client_types: true,
    supply_types: true,
};

export class DocumentTemplateDefaultRowsQuery {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Строки «по умолчанию» по трём поддержанным видам, одним заходом.
     *
     * `is_archived: false` обязателен: архивную строку резолвер не видит,
     * поэтому конфликта она не создаёт — иначе диагностика пугала бы админа
     * проблемами, которых в проде нет. Архивация в CRUD заодно сбрасывает
     * `is_default`, так что это ещё и страховка от легаси-строк.
     *
     * «Этот портал ИЛИ общий» при переданном портале: общий конфликтный
     * ящик достаётся и этому порталу тоже.
     *
     * Условие — через `OR`, а НЕ через `portal_id: { in: [id, null] }`:
     * в SQL `IN (…, NULL)` не находит NULL-строки (сравнение с NULL даёт
     * UNKNOWN), да и у Prisma `in` типизирован как `bigint[]`.
     */
    async findDefaultRows(
        portalId: bigint | null,
    ): Promise<TemplateDefaultRow[]> {
        const where = {
            is_default: true,
            is_active: true,
            is_archived: false,
            ...(portalId === null
                ? {}
                : { OR: [{ portal_id: portalId }, { portal_id: null }] }),
        };

        const [contract, supplyReport, invoice] = await Promise.all([
            this.prisma.contractTemplate.findMany({
                where,
                select: { ...DEFAULT_ROW_SELECT, contract_type: true },
            }),
            this.prisma.supplyReportTemplate.findMany({
                where,
                select: DEFAULT_ROW_SELECT,
            }),
            this.prisma.invoiceTemplate.findMany({
                where,
                select: DEFAULT_ROW_SELECT,
            }),
        ]);

        return [
            ...contract.map(row =>
                toDefaultRow(DocumentTemplateKind.CONTRACT, row),
            ),
            ...supplyReport.map(row =>
                toDefaultRow(DocumentTemplateKind.SUPPLY_REPORT, row),
            ),
            ...invoice.map(row =>
                toDefaultRow(DocumentTemplateKind.INVOICE, row),
            ),
        ];
    }

    /**
     * Виды, по которым у портала есть СВОЯ активная строка.
     * `portal_id` — точное равенство, общие строки здесь не считаются:
     * вопрос ровно в том, есть ли у портала что-то своё.
     */
    async findKindsWithOwnRows(
        portalId: bigint,
    ): Promise<DocumentTemplateKind[]> {
        const where = {
            portal_id: portalId,
            is_active: true,
            is_archived: false,
        };

        const [contract, supplyReport, invoice] = await Promise.all([
            this.prisma.contractTemplate.count({ where }),
            this.prisma.supplyReportTemplate.count({ where }),
            this.prisma.invoiceTemplate.count({ where }),
        ]);

        const kinds: DocumentTemplateKind[] = [];
        if (contract > 0) {
            kinds.push(DocumentTemplateKind.CONTRACT);
        }
        if (supplyReport > 0) {
            kinds.push(DocumentTemplateKind.SUPPLY_REPORT);
        }
        if (invoice > 0) {
            kinds.push(DocumentTemplateKind.INVOICE);
        }
        return kinds;
    }
}

/** id всегда строкой: у счёта CHAR(36)-uuid, у остальных BigInt. */
function toDefaultRow(
    kind: DocumentTemplateKind,
    row: DefaultRowSelection,
): TemplateDefaultRow {
    return {
        kind,
        id: String(row.id),
        portalId: row.portal_id,
        agentId: row.agent_id,
        // У отчёта и счёта колонки contract_type нет — всегда null.
        contractType: row.contract_type ?? null,
        clientTypes: row.client_types,
        supplyTypes: row.supply_types,
    };
}
