import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    DEAL_AUDIT_FIELD_CODES,
    DealAuditFlagCode,
    DealAuditStatusCode,
} from '../constants/deal-audit.const';

/** Имена UF-полей аудита на сделке; null — поле не установлено. */
export interface DealAuditFieldNames {
    readonly status: string | null;
    readonly flags: string | null;
    readonly auditedAt: string | null;
    readonly idleDays: string | null;
    readonly overdueDays: string | null;
    readonly stageDays: string | null;
    readonly openTasks: string | null;
    readonly comment: string | null;
}

/**
 * Поля аудита на портале: имена UF и bitrixId элементов справочников.
 *
 * Единая точка резолвинга для ридера (нужны прошлые значения) и писателя
 * (нужны имена и id элементов). Отдельный класс, а не два независимых
 * резолва, — иначе одно поле легко прочитать одним именем, а записать
 * другим, и расхождение всплывёт только на проде.
 */
export class DealAuditFields {
    readonly names: DealAuditFieldNames;
    private readonly statusItems: ReadonlyMap<string, number>;
    private readonly statusCodes: ReadonlyMap<number, string>;
    private readonly flagItems: ReadonlyMap<string, number>;

    constructor(portal: PortalModel) {
        this.names = {
            status: fieldName(portal, DEAL_AUDIT_FIELD_CODES.status),
            flags: fieldName(portal, DEAL_AUDIT_FIELD_CODES.flags),
            auditedAt: fieldName(portal, DEAL_AUDIT_FIELD_CODES.auditedAt),
            idleDays: fieldName(portal, DEAL_AUDIT_FIELD_CODES.idleDays),
            overdueDays: fieldName(portal, DEAL_AUDIT_FIELD_CODES.overdueDays),
            stageDays: fieldName(portal, DEAL_AUDIT_FIELD_CODES.stageDays),
            openTasks: fieldName(portal, DEAL_AUDIT_FIELD_CODES.openTasks),
            comment: fieldName(portal, DEAL_AUDIT_FIELD_CODES.comment),
        };
        this.statusItems = itemsOf(portal, DEAL_AUDIT_FIELD_CODES.status);
        this.statusCodes = new Map(
            [...this.statusItems].map(([code, id]) => [id, code]),
        );
        this.flagItems = itemsOf(portal, DEAL_AUDIT_FIELD_CODES.flags);
    }

    /**
     * Минимум, без которого писать нечего: статус и признаки.
     *
     * Self-gate вместо падения — как у остальных хуков ОП: неустановленное
     * поле означает «портал ещё не готов», а не аварию бэка.
     */
    get isInstalled(): boolean {
        return Boolean(this.names.status && this.names.flags);
    }

    /** bitrixId элемента справочника статусов; null — элемент не установлен. */
    statusItemId(code: DealAuditStatusCode): number | null {
        return this.statusItems.get(code) ?? null;
    }

    /** Код статуса по bitrixId элемента — для сравнения с прошлым прогоном. */
    statusCodeByItemId(raw: unknown): string | null {
        const id = Number(raw);
        if (!Number.isFinite(id) || id <= 0) return null;
        return this.statusCodes.get(id) ?? null;
    }

    /** bitrixId элемента справочника признаков; null — не установлен. */
    flagItemId(code: DealAuditFlagCode): number | null {
        return this.flagItems.get(code) ?? null;
    }

    /** Список имён полей для select сделки (без неустановленных). */
    selectNames(): string[] {
        return Object.values(this.names).filter((name): name is string =>
            Boolean(name),
        );
    }
}

const fieldName = (portal: PortalModel, code: string): string | null => {
    const field = portal.getEntityFieldByCode('deal', code);
    return field ? portal.getFieldBitrixId(field) : null;
};

const itemsOf = (
    portal: PortalModel,
    code: string,
): ReadonlyMap<string, number> => {
    const field = portal.getEntityFieldByCode('deal', code);
    const map = new Map<string, number>();
    for (const item of field?.items ?? []) {
        if (item.code && item.bitrixId) map.set(item.code, item.bitrixId);
    }
    return map;
};
