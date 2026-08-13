import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { PBXService } from '@/modules/pbx';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { EnumLeadRequestFieldCode } from '@lib/portal-lib/pbx/pbx-lead-request/type/pbx-lead-request.enum';
import { EnumSalesHookCode } from '../../sales-hooks/core/constants/sales-hook-code.enum';
import { EnumSalesHookSource } from '../../sales-hooks/core/contracts/sales-hook-job.type';
import { SalesHookDispatchService } from '../../sales-hooks/core/services/sales-hook-dispatch.service';
import { SalesHookIdempotencyService } from '../../sales-hooks/core/services/sales-hook-idempotency.service';
import { buildLeadToWorkItem } from '../../sales-hooks/lead-to-work/dto/lead-to-work.dto';
import { LeadRequestDetectorService } from '../../sales-hooks/lead-to-work/services/lead-request-detector.service';

// Плагины idempotent: extend() повторно — no-op (см. lead-request-history.util).
dayjs.extend(utc);
dayjs.extend(timezone);

/** Формат CRM datetime-полей Битрикса (локальное время портала). */
const CRM_DATETIME_FORMAT = 'DD.MM.YYYY HH:mm:ss';

/** Лид «в работе»: закрытые (CONVERTED/JUNK) дожимать нельзя. */
const IN_PROGRESS_SEMANTIC = 'P';

type BxRow = Record<string, unknown>;

/** Итог прохода страховки по домену (лог/диагностика/тесты). */
export interface LeadIntakeRescueRunResult {
    /** Свежих лидов в выборке (до отсева). */
    scanned: number;
    /** Назначений, запущенных повторно. */
    dispatched: number;
    /** Отсеяно: уже назначены, уже есть работа, не заявка. */
    skipped: number;
    warnings: string[];
}

/**
 * Страховка входа заявок: «лид пришёл, а хук назначения не отработал».
 *
 * Битрикс не повторяет вебхуки: одна сетевая ошибка — и заявка навсегда
 * зависает без ответственного. SLA-крон такой лид не видит принципиально —
 * он ищет НАЗНАЧЕННЫЕ и непринятые, а здесь назначения не было вовсе.
 *
 * Признак «хук не проходил» берём по НАШИМ полям, а не по стадии (её
 * двигают конструктор, роботы и люди):
 *  - `op_lead_assigned_at` пусто — заявку никому не назначали;
 *  - `to_base_sales` пусто — нашей сделки по лиду нет.
 * Оба заполняются в одной batch-группе хука, поэтому «пусто и там, и там»
 * означает именно «хук не отрабатывал», а не «отработал наполовину».
 *
 * Выборка ограничена окном создания (lookback) и лимитом на проход: крон
 * не должен перелопачивать десятки тысяч старых лидов портала.
 */
@Injectable()
export class LeadIntakeRescueService {
    private readonly logger = new Logger(LeadIntakeRescueService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly dispatch: SalesHookDispatchService,
        private readonly idempotency: SalesHookIdempotencyService,
    ) {}

    async runForDomain(
        domain: string,
        lookbackMinutes: number,
        maxPerRun: number,
        requestsOnly: boolean,
    ): Promise<LeadIntakeRescueRunResult> {
        const result: LeadIntakeRescueRunResult = {
            scanned: 0,
            dispatched: 0,
            skipped: 0,
            warnings: [],
        };
        const { bitrix, PortalModel: portal } = await this.pbx.init(domain);

        const assignedAtName = this.fieldName(
            portal,
            EnumLeadRequestFieldCode.op_lead_assigned_at,
        );
        const toBaseName = this.fieldName(
            portal,
            PBX_SALES_EVENT_FIELD_CODES.to_base_sales,
        );
        if (!assignedAtName && !toBaseName) {
            result.warnings.push(
                'Ни «Заявка назначена (дата)», ни «Корневая сделка Продажи» не установлены — отличить необработанный лид от обработанного нельзя, страховка пропущена',
            );
            return result;
        }

        const since = dayjs()
            .tz(portal.getTimezone())
            .subtract(lookbackMinutes, 'minute')
            .format(CRM_DATETIME_FORMAT);
        const filter: Record<string, unknown> = {
            '>DATE_CREATE': since,
            STATUS_SEMANTIC_ID: IN_PROGRESS_SEMANTIC,
        };
        // Сужаем выборку на стороне Битрикса, когда поле есть: пустое
        // `op_lead_assigned_at` и есть «никем не назначен».
        if (assignedAtName) filter[assignedAtName] = '';

        const { result: leads } = await bitrix.lead.getList(filter as never, [
            'ID',
            'TITLE',
            'STATUS_ID',
            'SOURCE_ID',
            'ASSIGNED_BY_ID',
            'DATE_CREATE',
            'UF_*',
        ]);
        const rows = (leads ?? []) as unknown as BxRow[];
        result.scanned = rows.length;
        if (!rows.length) return result;

        const detector = new LeadRequestDetectorService(portal);
        let dispatched = 0;

        for (const lead of rows) {
            const leadId = Number(lead.ID);
            if (!Number.isFinite(leadId) || leadId <= 0) continue;

            // Фильтр Битрикса по пустоте UF срабатывает не на всех порталах —
            // перепроверяем сами: лишний dispatch назначил бы заявку заново
            // и увёл её у работающего менеджера.
            if (assignedAtName && this.hasValue(lead[assignedAtName])) {
                result.skipped += 1;
                continue;
            }
            if (toBaseName && this.hasValue(lead[toBaseName])) {
                result.skipped += 1;
                continue;
            }
            if (requestsOnly && !detector.detect(lead).isRequest) {
                result.skipped += 1;
                continue;
            }
            if (dispatched >= maxPerRun) {
                result.warnings.push(
                    `Лимит ${maxPerRun} лидов за проход исчерпан — остальные дожмутся следующим тиком`,
                );
                break;
            }

            const sent = await this.dispatchAssignment(domain, leadId);
            if (sent) {
                dispatched += 1;
                result.dispatched += 1;
            } else {
                result.warnings.push(
                    `Лид ${leadId}: назначение уже выполняется другой операцией`,
                );
            }
        }

        this.logger.log(
            `[intake-rescue] ${domain}: просмотрено ${result.scanned}, ` +
                `дожато ${result.dispatched}, пропущено ${result.skipped}`,
        );
        return result;
    }

    /**
     * Повторный запуск назначения — тем же хуком и теми же флагами, что у
     * робота входа (ХО-ветка: сделка + задача + KPI + round-robin).
     * `responsible` не передаём: отдел и сотрудника выбирает хук.
     */
    private async dispatchAssignment(
        domain: string,
        leadId: number,
    ): Promise<boolean> {
        const item = buildLeadToWorkItem({
            leadId,
            isXo: 'Y',
            stageMode: 'new',
            taskMode: 'close',
        });
        const entityKey = `lead:${leadId}`;
        const operation = await this.dispatch.accept(
            EnumSalesHookCode.LEAD_TO_WORK,
            domain,
            EnumSalesHookSource.ROBOT,
            [
                {
                    entityKey,
                    // Отпечаток отличается от робота/SLA: страховка должна
                    // дожать лид, даже если робот по нему уже «отмечался».
                    fingerprint: this.idempotency.fingerprint(
                        EnumSalesHookCode.LEAD_TO_WORK,
                        entityKey,
                        { rescue: true, ...item },
                    ),
                    data: item,
                },
            ],
        );
        return !!operation;
    }

    /** UF-имя поля портала по коду; null — поле не установлено. */
    private fieldName(portal: PortalModel, code: string): string | null {
        const field = portal.getEntityFieldByCode('lead', code);
        return field ? portal.getFieldBitrixId(field) : null;
    }

    /** Значение поля непустое (учитывая multiple и '0'-подобный мусор). */
    private hasValue(raw: unknown): boolean {
        if (raw == null || raw === false) return false;
        const values = Array.isArray(raw) ? raw : [raw];
        return values.some(
            value =>
                value != null &&
                value !== false &&
                String(value).trim() !== '' &&
                String(value).trim() !== '0',
        );
    }
}
