import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import {
    SalesListReaderService,
    SalesListRecord,
} from '@lib/portal-lib/pbx/pbx-sales-list-reader';
import { AiService, TranscriptionStoreService } from '@lib/call-lib';
import { AGENT_ANALYSIS_TYPE } from '../../agent-gate/services/agent-call-package.service';
import { AgentCallAnalysisDto } from '../../agent-gate/dto/agent-analysis-request.dto';

/** Коды типов события «презентация» в списках отчётности. */
const PRESENTATION_EVENT_TYPE_CODES = [
    'presentation',
    'presentation_uniq',
    'presentation_contact_uniq',
];
/** Допуск сопоставления план ↔ факт, дней в каждую сторону. */
const MATCH_TOLERANCE_DAYS = 1;
/** Лимит планов за прогон. */
const PLANNED_LIMIT = 50;

/** Судьба одного плана презентации. */
export interface PresentationPlanItem {
    recordId: string;
    name: string;
    eventDate: string | null;
    responsibleId: string | null;
    /**
     * confirmed — есть AI-разбор звонка-презентации рядом; reported-only —
     * менеджер отчитался done-записью, но звонка-презентации в разборах
     * нет; missed — ни звонка, ни отчёта.
     */
    status: 'confirmed' | 'reported-only' | 'missed';
}

/** Итог план-факта одного домена. */
export interface PresentationPlanFactResult {
    domain: string;
    planned: number;
    confirmed: number;
    reportedOnly: number;
    missed: number;
    items: PresentationPlanItem[];
}

/**
 * ПЛАН-ФАКТ ПО ПРЕЗЕНТАЦИЯМ (идея владельца: «где запланирована
 * презентация — обязан быть звонок-презентация»): планы из списка КПИ
 * (тип события «Презентация», действие «План», дата события в окне)
 * сопоставляются с ФАКТАМИ двух видов:
 *  1. AI-разбор звонка типа «презентация» того же менеджера/сделки
 *     рядом по времени — презентация подтверждена звонком;
 *  2. done-запись КПИ без звонка — «отчитался, но звонок не найден»
 *     (кандидат на разбор с руководителем: презентация без записи
 *     разговора либо приписка).
 * Ни того ни другого — план ПРОПУЩЕН.
 *
 * Итог — дайджест в телеграм ({telegram:true}), только если есть
 * пропуски или отчёты без звонка. Fail-open: недоступность списков
 * даёт пустой прогон, не ошибку.
 */
@Injectable()
export class PresentationPlanFactService {
    private readonly logger = new Logger(PresentationPlanFactService.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly aiService: AiService,
    ) {}

    async runForDomain(
        domain: string,
        from: Date,
        to: Date,
    ): Promise<PresentationPlanFactResult> {
        const result: PresentationPlanFactResult = {
            domain,
            planned: 0,
            confirmed: 0,
            reportedOnly: 0,
            missed: 0,
            items: [],
        };
        const { bitrix, PortalModel } = await this.pbxService.init(domain);
        const reader = new SalesListReaderService(bitrix, PortalModel);

        const planned = (
            await reader.read('sales_kpi', {
                eventTypeCodes: PRESENTATION_EVENT_TYPE_CODES,
                eventActionCodes: ['plan'],
                dateFrom: from,
                dateTo: to,
                limit: PLANNED_LIMIT,
            })
        ).filter(record => record.id);
        result.planned = planned.length;
        if (!planned.length) return result;

        // Факты собираются с допуском вокруг окна планов.
        const tolerance = MATCH_TOLERANCE_DAYS * 24 * 60 * 60_000;
        const factFrom = new Date(from.getTime() - tolerance);
        const factTo = new Date(to.getTime() + tolerance);
        const calls = await this.loadPresentationCalls(
            domain,
            factFrom,
            factTo,
        );
        const doneRecords = await reader.read('sales_kpi', {
            eventTypeCodes: PRESENTATION_EVENT_TYPE_CODES,
            eventActionCodes: ['done'],
            dateFrom: factFrom,
            dateTo: factTo,
            limit: PLANNED_LIMIT * 2,
        });

        for (const plan of planned) {
            const status = this.resolveStatus(plan, calls, doneRecords);
            result.items.push({
                recordId: plan.id,
                name: plan.name,
                eventDate: plan.eventDate ?? plan.createdAt,
                responsibleId: plan.responsibleId,
                status,
            });
            if (status === 'confirmed') result.confirmed++;
            else if (status === 'reported-only') result.reportedOnly++;
            else result.missed++;
        }

        this.reportDigest(result);
        return result;
    }

    /** AI-разборы звонков-презентаций за окно (менеджер, сделка, дата). */
    private async loadPresentationCalls(
        domain: string,
        from: Date,
        to: Date,
    ): Promise<
        {
            userId: string | null;
            dealRef: string | null;
            startedAt: Date | null;
        }[]
    > {
        const rows = await this.transcriptionStore.findDoneInPeriod(
            domain,
            from,
            to,
        );
        if (!rows.length) return [];
        const records = await this.aiService.findByTranscriptionIds(
            rows.map(row => row.id),
        );
        const calls: {
            userId: string | null;
            dealRef: string | null;
            startedAt: Date | null;
        }[] = [];
        for (const row of rows) {
            const analysis = records.find(
                record =>
                    String(record.transcription_id) === row.id &&
                    record.type === AGENT_ANALYSIS_TYPE,
            );
            const dto = analysis?.user_result as AgentCallAnalysisDto | null;
            if (dto?.callType !== 'presentation') continue;
            calls.push({
                userId: row.userId ?? null,
                dealRef:
                    row.entityType === 'deal' && row.entityId
                        ? `D_${row.entityId}`
                        : null,
                startedAt: row.callStartedAt
                    ? new Date(row.callStartedAt)
                    : null,
            });
        }
        return calls;
    }

    /** Судьба плана: звонок → отчёт → пропуск. */
    private resolveStatus(
        plan: SalesListRecord,
        calls: {
            userId: string | null;
            dealRef: string | null;
            startedAt: Date | null;
        }[],
        doneRecords: SalesListRecord[],
    ): PresentationPlanItem['status'] {
        const planDate = this.parseEventDate(plan.eventDate ?? plan.createdAt);

        const byCall = calls.some(call => {
            const sameOwner =
                (call.dealRef && plan.crmRefs.includes(call.dealRef)) ||
                (call.userId &&
                    plan.responsibleId &&
                    String(call.userId) === String(plan.responsibleId));
            return (
                sameOwner && this.datesClose(planDate, call.startedAt ?? null)
            );
        });
        if (byCall) return 'confirmed';

        const byReport = doneRecords.some(done => {
            const sameOwner =
                done.crmRefs.some(ref => plan.crmRefs.includes(ref)) ||
                (done.responsibleId &&
                    plan.responsibleId &&
                    String(done.responsibleId) === String(plan.responsibleId));
            return (
                sameOwner &&
                this.datesClose(
                    planDate,
                    this.parseEventDate(done.eventDate ?? done.createdAt),
                )
            );
        });
        return byReport ? 'reported-only' : 'missed';
    }

    /** Даты в пределах допуска (нет даты — сопоставление только по владельцу). */
    private datesClose(a: Date | null, b: Date | null): boolean {
        if (!a || !b) return true;
        return (
            Math.abs(a.getTime() - b.getTime()) <=
            (MATCH_TOLERANCE_DAYS + 0.5) * 24 * 60 * 60_000
        );
    }

    /** Дата события списка: «ДД.ММ.ГГГГ …» либо ISO. */
    private parseEventDate(raw: string | null): Date | null {
        if (!raw) return null;
        const match = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(raw);
        if (match) {
            return new Date(`${match[3]}-${match[2]}-${match[1]}T00:00:00`);
        }
        const date = new Date(raw);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    /** Дайджест руководителю — только когда есть что чинить. */
    private reportDigest(result: PresentationPlanFactResult): void {
        const problems = result.items.filter(
            item => item.status !== 'confirmed',
        );
        if (!problems.length) {
            this.logger.log(
                `План-факт презентаций (${result.domain}): запланировано ${result.planned}, все подтверждены звонками`,
            );
            return;
        }
        const lines = problems.map(item => {
            const label =
                item.status === 'missed'
                    ? 'ПРОПУЩЕНА (ни звонка, ни отчёта)'
                    : 'отчёт есть, звонок-презентация не найден';
            return `• «${item.name}» (${item.eventDate ?? 'без даты'}, менеджер ${item.responsibleId ?? '—'}) — ${label}`;
        });
        this.logger.warn(
            `📅 План-факт презентаций (${result.domain}): запланировано ${result.planned}, ` +
                `подтверждено звонком ${result.confirmed}, отчёт без звонка ${result.reportedOnly}, ` +
                `пропущено ${result.missed}:\n${lines.join('\n')}`,
            { telegram: true, domain: result.domain },
        );
    }
}
