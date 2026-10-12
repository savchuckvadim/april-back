import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import {
    DocumentTemplateKind,
    TemplateCandidate,
    TemplateCriteria,
} from './document-template.criteria';
import {
    DocumentTemplateRepository,
    TemplateDefaultRow,
} from './document-template.repository';
import {
    parseClientTypes,
    parseSupplyTypes,
    parseTemplateListStrict,
} from './lib/template-lists.util';
import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';
import { DocumentTemplateDefaultRowsQuery } from './lib/default-rows.query';

/** Строка шаблона в том минимуме, который нужен ранжировщику. */
type TemplateRow = {
    id: bigint | string;
    /** Полезная нагрузка: ради неё генерация и спрашивает резолвер. */
    file_path: string;
    portal_id: bigint | null;
    agent_id: bigint | null;
    contract_type?: string | null;
    client_types: string | null;
    supply_types: string | null;
    /** Есть только у supply_report_templates. */
    required_fields?: string | null;
    optional_fields?: string | null;
    is_default: boolean;
    updated_at: Date | null;
    created_at: Date | null;
};

const CLIENT_TYPES = Object.values(ClientTypeEnum);
const SUPPLY_TYPES = Object.values(SupplyTypeEnum);

/**
 * Разбор JSON-списка кодов полей формы отчёта.
 *
 * Отдельно от `parseClientTypes`/`parseSupplyTypes`: справочника здесь нет —
 * допустимые коды задаёт КОД формы (`getSupplyReportFormFields`), а не БД,
 * и тянуть сюда зависимость от состава формы было бы инверсией слоёв.
 * Поэтому список отдаётся как есть, а лишние коды отсекает потребитель,
 * который форму знает. Никогда не кидает: битая строка = «не настроено».
 */
function parseFieldCodes(raw: string | null | undefined): string[] | null {
    if (typeof raw !== 'string' || raw.trim() === '') {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return null;
        }
        const codes = [
            ...new Set(
                parsed.filter(
                    (item): item is string => typeof item === 'string',
                ),
            ),
        ];
        return codes.length > 0 ? codes : null;
    } catch {
        return null;
    }
}

/**
 * Prisma-реализация выборки кандидатов.
 *
 * ВАЖНО про КП (`offer_templates`): у этой таблицы НЕТ колонки `portal_id` —
 * привязка к порталу живёт в join-таблице `offer_template_portal`, у которой
 * свои `is_active`/`is_default` (оба `@default(false)`), плюс существует
 * пятый, пользовательский уровень (`user_selected_templates.is_current`).
 * Поэтому единый четырёхуровневый каскад на КП не ложится, и
 * `DocumentTemplateKind.OFFER_WORD` здесь намеренно НЕ поддержан: его
 * резолвинг требует отдельного проектирования и делается отдельно,
 * чтобы не выдать шаблон страничного КП там, где нужен word.
 */
@Injectable()
export class DocumentTemplatePrismaRepository extends DocumentTemplateRepository {
    private readonly logger = new Logger(DocumentTemplatePrismaRepository.name);

    /**
     * Запросы диагностики. Создаётся здесь, а не инжектится: это деталь
     * реализации репозитория, которую больше никто не использует, и
     * отдельный провайдер в DI-графе ей не нужен.
     */
    private readonly defaultRows: DocumentTemplateDefaultRowsQuery;

    constructor(private readonly prisma: PrismaService) {
        super();
        this.defaultRows = new DocumentTemplateDefaultRowsQuery(prisma);
    }

    async findCandidates(
        kind: DocumentTemplateKind,
        criteria: TemplateCriteria,
    ): Promise<TemplateCandidate[]> {
        const where = this.buildWhere(kind, criteria);
        if (where === null) {
            return [];
        }
        const rows = await this.fetchRows(kind, where);
        return rows.map(row => this.toCandidate(kind, row));
    }

    async hasAnyForPortal(
        kind: DocumentTemplateKind,
        portalId: bigint | null,
    ): Promise<boolean> {
        if (portalId === null) {
            return false;
        }
        const where = {
            portal_id: portalId,
            is_active: true,
            is_archived: false,
        };

        const count =
            kind === DocumentTemplateKind.CONTRACT
                ? await this.prisma.contractTemplate.count({ where })
                : kind === DocumentTemplateKind.SUPPLY_REPORT
                  ? await this.prisma.supplyReportTemplate.count({ where })
                  : await this.prisma.invoiceTemplate.count({ where });

        return count > 0;
    }

    /**
     * Диагностика справочника — делегирование в
     * {@link DocumentTemplateDefaultRowsQuery}. Эти два запроса обходят
     * справочник целиком ради админки, а не обслуживают подбор шаблона при
     * генерации, поэтому живут отдельным классом: иначе репозиторий
     * переваливает за лимит 200-300 строк (CLAUDE.md).
     */
    async findDefaultRows(
        portalId: bigint | null,
    ): Promise<TemplateDefaultRow[]> {
        return this.defaultRows.findDefaultRows(portalId);
    }

    async findKindsWithOwnRows(
        portalId: bigint,
    ): Promise<DocumentTemplateKind[]> {
        return this.defaultRows.findKindsWithOwnRows(portalId);
    }

    /**
     * Жёсткие условия. `contract_type` — равенство, а не ранжируемый разряд:
     * у договора шаблона «на любой тип» не существует, и отрендерить
     * лицензионную сделку в абонентский шаблон хуже, чем не отдать документ.
     *
     * ИСПРАВЛЕНО: было `portal_id: { in: [portalId, null] }` (и то же по
     * agent_id). В SQL `IN (7, NULL)` НЕ находит строки с NULL — сравнение
     * с NULL даёт UNKNOWN, а не TRUE. То есть общие шаблоны
     * (`portal_id IS NULL`) и шаблоны «для любого поставщика»
     * (`agent_id IS NULL`) в кандидаты не попадали ВООБЩЕ, и весь каскад
     * «портал+поставщик → портал → общий» работал только на первом уровне:
     * у портала без собственной строки резолвер молча уходил в
     * storage-fallback, хотя подходящая общая строка в справочнике есть.
     * Ошибка не ловилась ни типами (`where` здесь `Record<string, unknown>`,
     * поэтому Prisma её не видит), ни тестами (все 64 мокают репозиторий).
     * Правильная форма — `OR` с явным `null`, его Prisma разворачивает в
     * `IS NULL`.
     */
    private buildWhere(
        kind: DocumentTemplateKind,
        criteria: TemplateCriteria,
    ): Record<string, unknown> | null {
        const where: Record<string, unknown> = {
            is_active: true,
            is_archived: false,
            // AND двух OR-ов, а не два OR на одном уровне: второй OR
            // перезаписал бы первый (один ключ в объекте), и фильтр по
            // порталу потерялся бы — шаблоны чужих порталов стали бы
            // кандидатами.
            AND: [
                {
                    OR: [{ portal_id: criteria.portalId }, { portal_id: null }],
                },
                {
                    OR: [{ agent_id: criteria.agentId }, { agent_id: null }],
                },
            ],
        };

        if (kind === DocumentTemplateKind.CONTRACT) {
            if (!criteria.contractType) {
                // Без типа договора у ДОГОВОРА кандидатов быть не должно:
                // шаблона «на любой тип» не существует, а тихий выбор
                // первого подходящего дал бы юридически неверный документ.
                return null;
            }
            where.contract_type = criteria.contractType;
        }
        // У счёта и отчёта колонки contract_type НЕТ (она есть только у
        // contract_templates), поэтому тип договора на них не фильтруется.
        // Как уточняющий признак он у них не выражен — если понадобится,
        // это отдельная колонка, а не условие по несуществующему полю.

        return where;
    }

    private async fetchRows(
        kind: DocumentTemplateKind,
        where: Record<string, unknown>,
    ): Promise<TemplateRow[]> {
        switch (kind) {
            case DocumentTemplateKind.CONTRACT:
                return this.prisma.contractTemplate.findMany({
                    where,
                    select: {
                        id: true,
                        file_path: true,
                        portal_id: true,
                        agent_id: true,
                        contract_type: true,
                        client_types: true,
                        supply_types: true,
                        is_default: true,
                        updated_at: true,
                        created_at: true,
                    },
                });
            case DocumentTemplateKind.SUPPLY_REPORT:
                return this.prisma.supplyReportTemplate.findMany({
                    where,
                    select: {
                        id: true,
                        file_path: true,
                        portal_id: true,
                        agent_id: true,
                        client_types: true,
                        supply_types: true,
                        // портальная настройка состава формы отчёта
                        required_fields: true,
                        optional_fields: true,
                        is_default: true,
                        updated_at: true,
                        created_at: true,
                    },
                });
            case DocumentTemplateKind.INVOICE:
                return this.prisma.invoiceTemplate.findMany({
                    where,
                    select: {
                        id: true,
                        file_path: true,
                        portal_id: true,
                        agent_id: true,
                        client_types: true,
                        supply_types: true,
                        is_default: true,
                        updated_at: true,
                        created_at: true,
                    },
                });
            default:
                // OFFER_WORD — см. докблок класса.
                throw new Error(
                    `Резолвинг шаблона для вида "${kind}" не поддержан: у offer_templates привязка к порталу через join-таблицу, нужен отдельный каскад`,
                );
        }
    }

    /**
     * Приведение строки к виду кандидата. `id` всегда строка: у счёта это
     * CHAR(36)-uuid, у остальных BigInt — один чистый ранжировщик обслуживает
     * оба случая, а BigInt заодно не утекает в JSON (он не сериализуется).
     */
    private toCandidate(
        kind: DocumentTemplateKind,
        row: TemplateRow,
    ): TemplateCandidate {
        this.warnOnDroppedCodes(kind, row);

        return {
            id: String(row.id),
            filePath: row.file_path,
            requiredFields: parseFieldCodes(row.required_fields),
            optionalFields: parseFieldCodes(row.optional_fields),
            portalId: row.portal_id,
            agentId: row.agent_id,
            contractType: row.contract_type ?? null,
            clientTypes: parseClientTypes(row.client_types),
            supplyTypes: parseSupplyTypes(row.supply_types),
            isDefault: row.is_default,
            updatedAt: row.updated_at,
            createdAt: row.created_at,
        };
    }

    /**
     * Разбор списков — fail-open: отброшенный неизвестный код превращает
     * «шаблон только для X» в «шаблон для всех». Молча так делать нельзя,
     * поэтому пишем warn с id строки.
     */
    private warnOnDroppedCodes(
        kind: DocumentTemplateKind,
        row: TemplateRow,
    ): void {
        const client = parseTemplateListStrict(row.client_types, CLIENT_TYPES);
        if (client.dropped) {
            this.logger.warn(
                `${kind} #${String(row.id)}: в client_types есть неизвестные коды — шаблон стал подходить шире, чем задумано (${row.client_types})`,
            );
        }

        const supply = parseTemplateListStrict(row.supply_types, SUPPLY_TYPES);
        if (supply.dropped) {
            this.logger.warn(
                `${kind} #${String(row.id)}: в supply_types есть неизвестные коды — шаблон стал подходить шире, чем задумано (${row.supply_types})`,
            );
        }
    }
}
