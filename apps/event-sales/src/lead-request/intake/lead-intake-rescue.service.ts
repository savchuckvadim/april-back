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
import { XoQueueReader } from './xo-queue.reader';
import { XoRouting, XoRoutingModel } from './xo-routing.model';

// Плагины idempotent: extend() повторно — no-op (см. lead-request-history.util).
dayjs.extend(utc);
dayjs.extend(timezone);

/** Формат CRM datetime-полей Битрикса (локальное время портала). */
const CRM_DATETIME_FORMAT = 'DD.MM.YYYY HH:mm:ss';

/** Лид «в работе»: закрытые (CONVERTED/JUNK) дожимать нельзя. */
const IN_PROGRESS_SEMANTIC = 'P';

/** Код видимой стадии-очереди отправки в ХО (todo2508 №3). */
const XO_QUEUE_STAGE_CODE = 'lead_xo_queue';

type BxRow = Record<string, unknown>;
type BitrixInstance = Awaited<ReturnType<PBXService['init']>>['bitrix'];

/** Лид, готовый к дожиму: id + маршрутизация от робота. */
interface ReadyLead {
    leadId: number;
    routing: XoRouting;
}

/**
 * Откуда крон брал лиды в этом проходе — решает НАСТРОЙКА ПОРТАЛА:
 *  - `queue` — стадия «Очередь в ХО» сопоставлена в админке, разбираем
 *    ТОЛЬКО её, целиком и без ограничений по датам;
 *  - `window` — стадия не сопоставлена, берём свежие лиды окна создания в
 *    любой открытой стадии.
 */
export type LeadIntakeRescueSource = 'queue' | 'window';

/** Итог прохода страховки по домену (лог/диагностика/тесты). */
export interface LeadIntakeRescueRunResult {
    /** Источник выборки этого прохода. */
    source: LeadIntakeRescueSource;
    /** Лидов просмотрено (до отсева). */
    scanned: number;
    /** Назначений, запущенных повторно. */
    dispatched: number;
    /** Отсеяно: уже назначены, уже есть работа, не заявка. */
    skipped: number;
    /**
     * Оставлено в очереди на РУЧНОЙ разбор: нет ни ответственного ХО, ни
     * отдела строкой — назначать некому. Всегда 0 в режиме `window`.
     */
    notReady: number;
    warnings: string[];
}

/** Всё, что нужно обеим выборкам: собирается один раз на домен. */
interface RescueContext {
    domain: string;
    bitrix: BitrixInstance;
    portal: PortalModel;
    /** UF-имя `op_lead_assigned_at`; null — поле не установлено. */
    assignedAtName: string | null;
    /** UF-имя `to_base_sales`; null — поле не установлено. */
    toBaseName: string | null;
    select: string[];
    maxPerRun: number;
    routing: XoRoutingModel;
}

/**
 * Страховка входа заявок: «лид пришёл, а хук назначения не отработал».
 *
 * Битрикс не повторяет вебхуки: одна сетевая ошибка — и заявка навсегда
 * зависает без ответственного. SLA-крон такой лид не видит принципиально —
 * он ищет НАЗНАЧЕННЫЕ и непринятые, а здесь назначения не было вовсе.
 *
 * ГДЕ ИСКАТЬ — решает настройка портала, а не код (см.
 * {@link LeadIntakeRescueSource}).
 *
 * Режим `queue` (стадия «Очередь в ХО» сопоставлена) — основной. Стадия
 * здесь буквально очередь: её надо разобрать ВСЮ, поэтому никаких окон по
 * дате создания или изменения. Что не влезло в порцию (`maxPerRun`) —
 * останется до следующего тика, что разобрать нельзя — останется в очереди
 * навсегда, пока человек не поправит карточку. Робот входа сам решает, кто
 * сюда попадает, поэтому фильтр «только заявки» здесь НЕ применяется:
 * очередь держит и заявки, и обычные лиды на обзвон.
 *
 * Режим `window` (стадия не сопоставлена) — прежнее поведение: свежие лиды
 * окна создания в любой открытой стадии, с фильтром «только заявки».
 *
 * Признак «хук не проходил» в обоих режимах — по НАШИМ полям, а не по
 * стадии (её двигают конструктор, роботы и люди):
 *  - `op_lead_assigned_at` пусто — заявку никому не назначали;
 *  - `to_base_sales` пусто — нашей сделки по лиду нет.
 * Оба заполняются в одной batch-группе хука, поэтому «пусто и там, и там»
 * означает именно «хук не отрабатывал», а не «отработал наполовину».
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
            source: 'window',
            scanned: 0,
            dispatched: 0,
            skipped: 0,
            notReady: 0,
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

        const ctx: RescueContext = {
            domain,
            bitrix,
            portal,
            assignedAtName,
            toBaseName,
            // `UF_*` забирает все пользовательские поля разом — отдельно
            // перечислять поля маршрутизации не нужно.
            select: [
                'ID',
                'TITLE',
                'STATUS_ID',
                'SOURCE_ID',
                'ASSIGNED_BY_ID',
                'DATE_CREATE',
                'UF_*',
            ],
            maxPerRun,
            routing: new XoRoutingModel(portal, 'lead'),
        };

        const queueStatusId =
            portal.getLeadStatusIdByCode(XO_QUEUE_STAGE_CODE) ?? null;
        result.source = queueStatusId ? 'queue' : 'window';

        const ready = queueStatusId
            ? await this.collectFromQueue(ctx, queueStatusId, result)
            : await this.collectFromWindow(
                  ctx,
                  lookbackMinutes,
                  requestsOnly,
                  result,
              );

        for (const lead of ready) {
            const sent = await this.dispatchAssignment(
                domain,
                lead.leadId,
                lead.routing,
            );
            if (sent) {
                result.dispatched += 1;
            } else {
                result.warnings.push(
                    `Лид ${lead.leadId}: назначение уже выполняется другой операцией`,
                );
            }
        }

        this.logger.log(
            `[intake-rescue] ${domain} (${result.source}): просмотрено ` +
                `${result.scanned}, дожато ${result.dispatched}, пропущено ` +
                `${result.skipped}, ждут ручного разбора ${result.notReady}`,
        );
        return result;
    }

    /**
     * Режим `queue`: разбираем стадию целиком, страницами по ID, пока не
     * наберём порцию. Даты не участвуют вообще — очередь есть очередь.
     */
    private async collectFromQueue(
        ctx: RescueContext,
        queueStatusId: string,
        result: LeadIntakeRescueRunResult,
    ): Promise<ReadyLead[]> {
        const reader = new XoQueueReader(ctx.bitrix, queueStatusId, ctx.select);
        const ready: ReadyLead[] = [];

        for await (const page of reader.pages()) {
            if (page.error) {
                result.warnings.push(
                    `Чтение очереди ХО прервано: ${page.error.message} — остаток дожмётся следующим тиком`,
                );
                break;
            }
            for (const row of page.rows) {
                if (ready.length >= ctx.maxPerRun) break;
                result.scanned += 1;
                const lead = this.classify(ctx, row, result);
                if (lead) ready.push(lead);
            }
            if (ready.length >= ctx.maxPerRun) {
                result.warnings.push(
                    `Порция ${ctx.maxPerRun} лидов набрана — остаток очереди ХО разберётся следующим тиком`,
                );
                break;
            }
        }
        return ready;
    }

    /**
     * Режим `window`: одна выборка по окну создания. Здесь стадия ничего не
     * гарантирует, поэтому фильтр «только заявки» остаётся — иначе крон
     * дожимал бы всё подряд, включая заведённое руками.
     */
    private async collectFromWindow(
        ctx: RescueContext,
        lookbackMinutes: number,
        requestsOnly: boolean,
        result: LeadIntakeRescueRunResult,
    ): Promise<ReadyLead[]> {
        const since = dayjs()
            .tz(ctx.portal.getTimezone())
            .subtract(lookbackMinutes, 'minute')
            .format(CRM_DATETIME_FORMAT);
        const filter: Record<string, unknown> = {
            '>DATE_CREATE': since,
            STATUS_SEMANTIC_ID: IN_PROGRESS_SEMANTIC,
        };
        // Сужаем выборку на стороне Битрикса, когда поле есть: пустое
        // `op_lead_assigned_at` и есть «никем не назначен».
        if (ctx.assignedAtName) filter[ctx.assignedAtName] = '';

        const { result: rows } = await ctx.bitrix.lead.getList(
            filter as never,
            ctx.select,
        );
        const detector = new LeadRequestDetectorService(ctx.portal);
        const ready: ReadyLead[] = [];

        for (const row of ((rows ?? []) as unknown as BxRow[]).filter(
            Boolean,
        )) {
            if (ready.length >= ctx.maxPerRun) {
                result.warnings.push(
                    `Лимит ${ctx.maxPerRun} лидов за проход исчерпан — остальные дожмутся следующим тиком`,
                );
                break;
            }
            result.scanned += 1;
            if (requestsOnly && !detector.detect(row).isRequest) {
                result.skipped += 1;
                continue;
            }
            const lead = this.classify(ctx, row, result);
            if (lead) ready.push(lead);
        }
        return ready;
    }

    /**
     * Общий отсев строки: валидный id → не обработан ранее → есть кому
     * назначать. Готовность (`isReady`) обязательна только для очереди —
     * в режиме `window` маршрутизации может не быть вовсе, и ответственного
     * тогда выбирает сам хук round-robin'ом по всем ОП (прежнее поведение).
     */
    private classify(
        ctx: RescueContext,
        row: BxRow,
        result: LeadIntakeRescueRunResult,
    ): ReadyLead | null {
        const leadId = Number(row.ID);
        if (!Number.isFinite(leadId) || leadId <= 0) return null;

        // Фильтр Битрикса по пустоте UF срабатывает не на всех порталах, а в
        // очереди его нет вовсе — перепроверяем сами: лишний dispatch
        // назначил бы заявку заново и увёл её у работающего менеджера.
        if (ctx.assignedAtName && this.hasValue(row[ctx.assignedAtName])) {
            result.skipped += 1;
            return null;
        }
        if (ctx.toBaseName && this.hasValue(row[ctx.toBaseName])) {
            result.skipped += 1;
            return null;
        }

        const routing = ctx.routing.read(row);
        if (result.source === 'queue' && !ctx.routing.isReady(routing)) {
            result.notReady += 1;
            return null;
        }
        return { leadId, routing };
    }

    /**
     * Повторный запуск назначения — тем же хуком и теми же флагами, что у
     * робота входа (ХО-ветка: сделка + задача + KPI + round-robin).
     *
     * Маршрутизацию отдаём хуку как есть: заполнил робот `xo_responsible` —
     * пойдёт к нему, заполнил только отдел — round-robin внутри отдела,
     * пусто — round-robin по всем ОП (возможно только в режиме `window`).
     */
    private async dispatchAssignment(
        domain: string,
        leadId: number,
        routing: XoRouting,
    ): Promise<boolean> {
        const item = buildLeadToWorkItem({
            leadId,
            responsible: routing.responsible ?? undefined,
            department: routing.department ?? undefined,
            name: routing.name ?? undefined,
            deadline: routing.deadline ?? undefined,
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
