import dayjs from 'dayjs';
import { IField, IFieldItem } from '@lib/portal/interfaces/portal.interface';
import { PortalModel } from '@lib/portal/services/portal.model';
import { EventReportContext } from '../context/event-report.context';
import { GSIRK_DOMAIN } from '../../types/event-report.event-codes';
import { EnumWorkStatusCode } from '../../types/report-types';

type EntityFieldValue = string | number | string[] | null;
type EntityFieldsMap = Record<string, EntityFieldValue>;

/**
 * Тип сущности, для которой формируются UF_CRM_* поля.
 * Логика portal-полей одинакова для всех — отличается только источник «текущих»
 * значений (для multiple-полей вроде op_mhistory).
 */
export type EntityFieldsTargetType = 'company' | 'lead' | 'deal';

/**
 * Роль сделки (только для `entityType='deal'`). Нужна, чтобы понять, надо ли
 * добавлять `to_base_sales` (связь с корневой sales_base) и как обнулять
 * `pres_count`.
 */
export type DealRole = 'base' | 'presentation' | 'xo' | 'tmc';

/**
 * Лимиты на multiple-поля (исторически выставлены в legacy `EventReportService`).
 *
 * `op_mhistory` для gsirk сильно больше — этот портал использует историю как
 * аудит. На остальных порталах обрезаем чаще, чтобы Bitrix не отказал в
 * больших значениях.
 */
const HISTORY_LIMIT_DEFAULT = 12;
const HISTORY_LIMIT_GSIRK = 30;
const PRES_COMMENTS_LIMIT = 15;
const FAIL_COMMENTS_LIMIT = 18;

/**
 * Опции для построения полей сделки (entityType='deal').
 */
export interface DealFieldsOptions {
    /** Конкретная сделка-источник для чтения текущих multiple-полей (op_mhistory, pres_comments). */
    deal: Record<string, unknown> | null;
    /** Роль сделки — определяет связи и обнуление pres_count для презентации. */
    role: DealRole;
    /**
     * ID корневой sales_base сделки (реальный ID или `$result[set_base_deal]`).
     * Используется только для `role='presentation'` — выставляется в поле
     * `to_base_sales`. Для остальных ролей игнорируется.
     */
    baseDealId?: string | null;
}

/**
 * Чистая модель: получает {@link EventReportContext} и собирает мапу
 * `UF_CRM_*` → значение для company / lead / deal. Никаких побочных
 * эффектов: модель не дёргает Bitrix.
 *
 * Сценарии формирования полей следуют map из `event-report-service-map.md`
 * § «Блок 3: Поля сущностей».
 *
 * Для сделок (`entityType='deal'`):
 * - сама сделка передаётся через `dealOptions.deal`;
 * - для презентации добавляется `to_base_sales`;
 * - `pres_count` инкрементируется относительно current deal (или 0 для новой
 *   презентации; для plan/fail презентации стартует с -1 → ++ = 0).
 * - `ASSIGNED_BY_ID` для сделок не ставится — он уже выставляется
 *   deal-сервисом в base-полях.
 */
export class EventReportEntityFieldsModel {
    constructor(
        private readonly portal: PortalModel,
        private readonly ctx: EventReportContext,
        private readonly entityType: EntityFieldsTargetType,
        private readonly dealOptions: DealFieldsOptions | null = null,
    ) {}

    toFields(): EntityFieldsMap {
        const out: EntityFieldsMap = {};

        // ===== Always =====
        if (this.ctx.planEventType || this.ctx.reportEventType) {
            this.setScalar(out, 'call_last_date', this.nowCrmDate());
            this.setScalar(out, 'next_pres_plan_date', null);
            this.setScalar(out, 'call_next_date', null);
            this.setScalar(out, 'manager_op', this.ctx.planResponsibleId);
        }

        // ===== isPresentationDone =====
        if (this.ctx.isPresentationDone) {
            this.setScalar(out, 'last_pres_done_date', this.nowCrmDate());
            this.setScalar(
                out,
                'last_pres_done_responsible',
                this.ctx.planResponsibleId,
            );
            this.bumpPresCount(out);
            this.appendMultiple(
                out,
                'pres_comments',
                this.presentationDoneComment(),
                PRES_COMMENTS_LIMIT,
            );
        }

        // ===== isPlanned =====
        if (this.ctx.isPlanned) {
            this.applyPlannedFields(out);
        }

        // ===== isExpired =====
        if (this.ctx.isExpired) {
            this.applyExpiredFields(out);
        }

        // ===== Финальный статус =====
        if (!this.ctx.isPlanned) {
            if (this.ctx.isFail) {
                this.setScalar(
                    out,
                    'op_current_status',
                    this.statusText('Отказ'),
                );
                this.appendMultiple(
                    out,
                    'op_fail_comments',
                    this.failComment(),
                    FAIL_COMMENTS_LIMIT,
                );
            }
            if (this.ctx.isSuccessSale) {
                this.setScalar(
                    out,
                    'op_current_status',
                    this.statusText('Успех: продажа состоялась'),
                );
            }
        }

        // ===== Enumeration: op_work_status / op_prospects_type =====
        this.applyEnumeration(
            out,
            'op_work_status',
            this.resolveWorkStatusCode(),
        );
        this.applyEnumeration(
            out,
            'op_prospects_type',
            this.resolveProspectsCode(),
        );

        // ===== Enumeration: noresult / fail reason =====
        if (!this.ctx.isResult && this.ctx.dto.report?.noresultReason) {
            const code = this.ctx.dto.report.noresultReason.current?.code;
            if (code) {
                this.applyEnumeration(out, 'op_noresult_reason', code);
            }
        }
        if (this.ctx.isFail && this.ctx.dto.report?.failReason) {
            const failReasonCode = this.ctx.dto.report.failReason.current?.code;
            if (failReasonCode) {
                this.applyEnumeration(
                    out,
                    'op_efield_fail_reason',
                    `op_efield_fail_${failReasonCode}`,
                );
            }
        }

        // ===== История op_history / op_mhistory =====
        this.appendHistory(out);

        // ===== entity-specific =====
        if (this.entityType === 'company' && this.ctx.planResponsibleId) {
            out['ASSIGNED_BY_ID'] = this.ctx.planResponsibleId;
        }

        // ===== Deal-only: связь pres-сделки с корневой sales_base =====
        if (
            this.entityType === 'deal' &&
            this.dealOptions?.role === 'presentation' &&
            this.dealOptions.baseDealId
        ) {
            this.setScalar(out, 'to_base_sales', this.dealOptions.baseDealId);
        }

        return out;
    }

    // ---------- private ----------

    private applyPlannedFields(out: EntityFieldsMap): void {
        this.setScalar(out, 'call_next_date', this.ctx.planDeadline);
        this.setScalar(out, 'call_next_name', this.ctx.planEventName);
        this.setScalar(
            out,
            'op_current_status',
            this.statusText('Звонок запланирован в работе'),
        );
        this.setScalar(out, 'xo_responsible', this.ctx.planResponsibleId);
        this.setScalar(out, 'xo_created', this.ctx.planCreatedById);

        switch (this.ctx.planEventType) {
            case 'xo':
                this.setScalar(out, 'xo_date', this.ctx.planDeadline);
                this.setScalar(out, 'xo_name', this.ctx.planEventName);
                break;
            case 'hot':
                this.setScalar(
                    out,
                    'op_current_status',
                    this.statusText('В решении'),
                );
                break;
            case 'moneyAwait':
                this.setScalar(
                    out,
                    'op_current_status',
                    this.statusText('Ждём оплаты'),
                );
                break;
            case 'presentation':
                this.setScalar(out, 'last_pres_plan_date', this.nowCrmDate());
                this.setScalar(
                    out,
                    'last_pres_plan_responsible',
                    this.ctx.planResponsibleId,
                );
                this.setScalar(
                    out,
                    'next_pres_plan_date',
                    this.ctx.planDeadline,
                );
                this.setScalar(
                    out,
                    'op_current_status',
                    this.statusText('В работе: Презентация запланирована'),
                );
                this.appendMultiple(
                    out,
                    'pres_comments',
                    this.presentationPlanComment(),
                    PRES_COMMENTS_LIMIT,
                );
                break;
            default:
                break;
        }
    }

    private applyExpiredFields(out: EntityFieldsMap): void {
        switch (this.ctx.reportEventType) {
            case 'xo':
                this.setScalar(out, 'xo_date', this.ctx.planDeadline);
                this.setScalar(
                    out,
                    'op_current_status',
                    this.statusText('Перенос: Холодный звонок'),
                );
                break;
            case 'presentation':
                this.setScalar(
                    out,
                    'next_pres_plan_date',
                    this.ctx.planDeadline,
                );
                this.appendMultiple(
                    out,
                    'pres_comments',
                    this.presentationExpiredComment(),
                    PRES_COMMENTS_LIMIT,
                );
                this.setScalar(
                    out,
                    'op_current_status',
                    this.statusText('Перенос: Презентация'),
                );
                break;
            default:
                break;
        }
    }

    private resolveWorkStatusCode(): string | null {
        if (this.ctx.isSuccessSale) return 'op_status_success';
        if (this.ctx.isFail) return 'op_status_fail';
        if (this.ctx.workStatusCode === EnumWorkStatusCode.setAside)
            return 'op_status_in_long';
        if (this.ctx.planEventType === 'hot') return 'op_status_in_progress';
        if (this.ctx.planEventType === 'moneyAwait')
            return 'op_status_money_await';
        if (this.ctx.isInWork) return 'op_status_in_work';
        return null;
    }

    private resolveProspectsCode(): string | null {
        if (this.ctx.isInWork || this.ctx.isSuccessSale) return null;
        const failTypeCode = this.ctx.dto.report?.failType?.current?.code;
        if (!failTypeCode) return 'op_prospects_nopersp';
        const map: Record<string, string> = {
            garant: 'op_prospects_garant',
            go: 'op_prospects_go',
            territory: 'op_prospects_territory',
            accountant: 'op_prospects_acountant',
            autsorc: 'op_prospects_autsorc',
            depend: 'op_prospects_depend',
            op_prospects_nophone: 'op_prospects_nophone',
            op_prospects_company: 'op_prospects_company',
            failure: 'op_prospects_fail',
        };
        return map[failTypeCode] ?? 'op_prospects_nopersp';
    }

    private applyEnumeration(
        out: EntityFieldsMap,
        code: string,
        itemCode: string | null,
    ): void {
        if (!itemCode) return;
        const field = this.portal.getEntityFieldByCode(this.entityType, code);
        if (!field) return;
        const item = this.portal.getFieldItemByCode(field, itemCode);
        if (!item || item.bitrixId == null) return;
        out[this.bitrixKey(field)] = item.bitrixId;
    }

    private setScalar(
        out: EntityFieldsMap,
        code: string,
        value: EntityFieldValue,
    ): void {
        const field = this.portal.getEntityFieldByCode(this.entityType, code);
        if (!field) return;
        out[this.bitrixKey(field)] = value;
    }

    private bumpPresCount(out: EntityFieldsMap): void {
        const field = this.portal.getEntityFieldByCode(
            this.entityType,
            'pres_count',
        );
        if (!field) return;
        // Legacy: для презентации стартуем с 0, а на plan/fail с -1 (++ = 0)
        // — потому что для НОВОЙ pres-сделки счётчик не наследуем.
        let current = this.readNumber(this.entityRecord(), field);
        if (
            this.entityType === 'deal' &&
            this.dealOptions?.role === 'presentation'
        ) {
            const role = this.deriveDealEventAction();
            current = role === 'plan' || role === 'fail' ? -1 : 0;
        }
        out[this.bitrixKey(field)] = current + 1;
    }

    /**
     * Возвращает «событие» для роли сделки — нужно для обнуления pres_count.
     */
    private deriveDealEventAction(): 'plan' | 'done' | 'fail' | 'unplanned' {
        if (this.ctx.isFail) return 'fail';
        if (this.ctx.isUnplannedPresentation) return 'unplanned';
        if (this.ctx.isPlanned && this.ctx.planEventType === 'presentation')
            return 'plan';
        return 'done';
    }

    private appendMultiple(
        out: EntityFieldsMap,
        code: string,
        line: string,
        limit: number,
    ): void {
        const field = this.portal.getEntityFieldByCode(this.entityType, code);
        if (!field) return;
        const key = this.bitrixKey(field);
        const previous = this.readMultiple(this.entityRecord(), field);
        const next = [line, ...previous].slice(0, limit);
        out[key] = next;
    }

    private appendHistory(out: EntityFieldsMap): void {
        const limit = this.ctx.isGsirk
            ? HISTORY_LIMIT_GSIRK
            : HISTORY_LIMIT_DEFAULT;
        const line = `${this.nowCrmDate()}\n${this.fullEventComment()}`;
        this.appendMultiple(out, 'op_mhistory', line, limit);
        this.setScalar(out, 'op_history', line);
    }

    private statusText(prefix: string): string {
        return this.ctx.planEventName
            ? `${prefix}: ${this.ctx.planEventName}`
            : prefix;
    }

    private fullEventComment(): string {
        const parts: string[] = [];
        if (this.ctx.reportEventType) {
            parts.push(`Отчёт: ${this.ctx.reportEventType}`);
        }
        if (this.ctx.planEventType) {
            parts.push(`План: ${this.ctx.planEventType}`);
        }
        if (this.ctx.reportComment) parts.push(this.ctx.reportComment);
        return parts.filter(Boolean).join(' • ');
    }

    private presentationPlanComment(): string {
        return `${this.nowCrmDate()} Запланирована презентация: ${this.ctx.planEventName}`;
    }
    private presentationDoneComment(): string {
        return `${this.nowCrmDate()} Презентация состоялась: ${this.ctx.reportEventName}`;
    }
    private presentationExpiredComment(): string {
        return `${this.nowCrmDate()} Перенос презентации: ${this.ctx.planEventName}`;
    }
    private failComment(): string {
        return `${this.nowCrmDate()} Отказ: ${this.ctx.reportComment}`;
    }

    private nowCrmDate(): string {
        return dayjs(this.ctx.nowDate)
            .tz(this.portal.getTimezone())
            .format('DD.MM.YYYY HH:mm:ss');
    }

    private bitrixKey(field: IField): string {
        return `UF_CRM_${field.bitrixId}`;
    }

    private entityRecord(): Record<string, unknown> | null {
        if (this.entityType === 'deal') {
            return this.dealOptions?.deal ?? null;
        }
        if (this.entityType === 'company') {
            return this.ctx.company as unknown as Record<
                string,
                unknown
            > | null;
        }
        return this.ctx.lead as unknown as Record<string, unknown> | null;
    }

    private readNumber(
        entity: Record<string, unknown> | null,
        field: IField,
    ): number {
        if (!entity) return 0;
        const raw = entity[this.bitrixKey(field)];
        const n = Number(raw);
        return Number.isFinite(n) ? n : 0;
    }

    private readMultiple(
        entity: Record<string, unknown> | null,
        field: IField,
    ): string[] {
        if (!entity) return [];
        const raw = entity[this.bitrixKey(field)];
        if (Array.isArray(raw)) {
            return raw.map(v => String(v));
        }
        if (typeof raw === 'string' && raw) {
            return [raw];
        }
        return [];
    }

    /**
     * Зарезервировано — `IFieldItem` будет нужен в будущей расширенной
     * валидации (например, проверка `isActive`). Сейчас не используется,
     * сохраняем import-связь для последующих фич.
     */
    public static __ensureFieldItemImport: IFieldItem | null = null;

    /** Используется только при необходимости debug-вывода. */
    public dumpDomain(): string {
        return this.ctx.isGsirk ? GSIRK_DOMAIN : this.ctx.domain;
    }
}
