import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import {
    AGENT_ANALYSIS_TYPE,
    AiService,
    CALL_REFUSAL_AUDIT_TYPE,
    TranscriptionStoreService,
} from '@lib/call-lib';
import { CallReportDealFamilyService } from '@lib/call-lib/call-report/services/call-report-deal-family.service';
import { CallReportSmartResolverService } from '@lib/call-lib/call-report/services/call-report-smart-resolver.service';
import { CallReportSmartWriterService } from '@lib/call-lib/call-report/services/call-report-smart-writer.service';
import { AgentCallAnalysisDto } from '../../agent-gate/dto/agent-analysis-request.dto';
import { RefusalReasonReader } from './refusal-reason.reader';
import {
    MANAGER_REFUSAL_FIELDS_MISSING,
    MANAGER_REFUSAL_REASON_MISSING,
    ManagerRefusalReason,
    renderRefusalMismatchNote,
} from './refusal-reason.util';

/** Итог сверки причин отказа по домену. */
export interface CallRefusalAuditDomainResult {
    domain: string;
    /** Разборов в окне, у которых есть смарт-элемент и сделка. */
    candidates: number;
    /** Сверено (записан вердикт). */
    audited: number;
    /** Из них с расхождением «причина отказа не зафиксирована». */
    mismatched: number;
    /** Пропущено: уже сверено ранее (идемпотентность). */
    skippedDone: number;
    failed: number;
}

/** Кандидат сверки: разбор + адресация звонка. */
interface RefusalCandidate {
    transcriptionId: string;
    dto: AgentCallAnalysisDto;
    activityId: string | null;
    callStartedAt: Date | null;
    entityType: string | null;
    entityId: string | null;
}

/** Вердикт сверки — он же содержимое ais-записи. */
interface RefusalVerdict {
    dealId: number | null;
    stageTitle: string | null;
    mismatch: boolean;
    aiReason: string | null;
    managerReason: string | null;
    note: string;
}

/**
 * СВЕРКА ПРИЧИНЫ ОТКАЗА (решение владельца 08.09.2026, раздел 3 плана
 * ai/tasks/call-report-prod-fixes.md).
 *
 * Прод-случай: менеджер закрыл сделку финалом отказа с комментарием
 * «08.09 отказ», причина в карточке не зафиксирована, хотя в разговоре она
 * прозвучала и разбор её услышал. Без причин отказа не работает ни разбор
 * возражений, ни аналитика утечек.
 *
 * Что делает: для свежих разборов берёт сделку воронки «ОП Основная»
 * (та же раскладка связей, что у писателя), смотрит финал отказа и читает
 * ПОЛЯ причины отказа — на сделке и в записях «ОП KPI»/«ОП История»
 * (RefusalReasonReader). Пусто при закрытии отказом — расхождение: в
 * карточку разбора уходят четыре поля (AI · менеджер · расхождение ·
 * объяснение), как у «хвоста» и «5К».
 *
 * ЧЕГО НЕ ДЕЛАЕТ: не переписывает поля менеджера в его карточках и не
 * зовёт модель — сверка чисто программная (владелец: «фиксировать
 * расхождение, поля не трогать»).
 *
 * Идемпотентность: ais-запись type='call-refusal-audit' на транскрипцию.
 * Fail-open по каждому звонку.
 */
@Injectable()
export class CallRefusalAuditService {
    private readonly logger = new Logger(CallRefusalAuditService.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly aiService: AiService,
        private readonly smartResolver: CallReportSmartResolverService,
        private readonly dealFamily: CallReportDealFamilyService,
    ) {}

    async runForDomain(
        domain: string,
        from: Date,
        to: Date,
        maxEntities = 20,
    ): Promise<CallRefusalAuditDomainResult> {
        const result: CallRefusalAuditDomainResult = {
            domain,
            candidates: 0,
            audited: 0,
            mismatched: 0,
            skippedDone: 0,
            failed: 0,
        };
        const rows = await this.transcriptionStore.findDoneInPeriod(
            domain,
            from,
            to,
        );
        if (!rows.length) return result;
        const records = await this.aiService.findByTranscriptionIds(
            rows.map(row => row.id),
        );

        const candidates: RefusalCandidate[] = [];
        for (const row of rows) {
            const forRow = records.filter(
                record => String(record.transcription_id) === row.id,
            );
            if (
                forRow.some(record => record.type === CALL_REFUSAL_AUDIT_TYPE)
            ) {
                result.skippedDone++;
                continue;
            }
            const dto = forRow.find(
                record => record.type === AGENT_ANALYSIS_TYPE,
            )?.user_result as AgentCallAnalysisDto | null;
            if (!dto) continue;
            candidates.push({
                transcriptionId: row.id,
                dto,
                activityId: row.activityId ?? null,
                callStartedAt: row.callStartedAt
                    ? new Date(row.callStartedAt)
                    : null,
                entityType: row.entityType ?? null,
                entityId: row.entityId ?? null,
            });
        }
        result.candidates = candidates.length;

        for (const candidate of candidates.slice(0, maxEntities)) {
            try {
                const verdict = await this.auditOne(domain, candidate);
                if (!verdict) continue;
                result.audited++;
                if (verdict.mismatch) result.mismatched++;
            } catch (error) {
                result.failed++;
                this.logger.warn(
                    `Сверка причины отказа (${domain}, transcription ${candidate.transcriptionId}) не удалась: ${(error as Error).message}`,
                );
            }
        }
        this.logger.log(
            `Сверка причин отказа (${domain}): кандидатов ${result.candidates}, ` +
                `сверено ${result.audited}, не зафиксировано причин ${result.mismatched}, ` +
                `уже сверено ${result.skippedDone}, ошибок ${result.failed}`,
        );
        return result;
    }

    /**
     * Сверка одного звонка. null — сделка отказом не закрыта: сверять
     * нечего, вердикт не пишем (и звонок остаётся кандидатом на завтра,
     * когда менеджер может закрыть сделку).
     */
    private async auditOne(
        domain: string,
        candidate: RefusalCandidate,
    ): Promise<RefusalVerdict | null> {
        const { bitrix, PortalModel: portal } =
            await this.pbxService.init(domain);
        const ownerDealId =
            candidate.entityType === 'deal' && candidate.entityId
                ? Number(candidate.entityId)
                : undefined;
        const family = await this.dealFamily.resolve(domain, ownerDealId);
        const dealId = family.mainDealId ?? null;
        if (!dealId) return null;

        const reader = new RefusalReasonReader(bitrix, portal);
        const deal = await reader.readDeal(dealId);
        if (!deal?.refusalStageTitle) return null;

        const fromDeal = reader.fromDeal(deal.row);
        const manager = fromDeal.recorded
            ? fromDeal
            : this.merge(
                  fromDeal,
                  await reader.fromLists(dealId, candidate.callStartedAt),
              );

        const aiReason = candidate.dto.refusalReason?.trim() || null;
        // Поля причины отказа на портале не заведены — сверять не с чем:
        // расхождение НЕ ставим, пишем честный текст (штатная деградация).
        const mismatch = manager.fieldsConfigured && !manager.recorded;
        const verdict: RefusalVerdict = {
            dealId,
            stageTitle: deal.refusalStageTitle,
            mismatch,
            aiReason,
            managerReason: manager.text,
            note: manager.fieldsConfigured
                ? manager.recorded
                    ? `Причина отказа зафиксирована менеджером: ${manager.text}`
                    : renderRefusalMismatchNote(
                          aiReason,
                          deal.refusalStageTitle,
                      )
                : MANAGER_REFUSAL_FIELDS_MISSING,
        };

        await this.persist(domain, candidate, verdict);
        await this.writeToSmart(domain, bitrix, candidate, manager, verdict);
        this.logger.log(
            `Причина отказа (${domain}, сделка ${dealId}, финал «${deal.refusalStageTitle}»): ` +
                (mismatch
                    ? `НЕ ЗАФИКСИРОВАНА менеджером; AI услышал: ${aiReason ?? '—'}`
                    : `у менеджера «${manager.text ?? '—'}» (${manager.source ?? 'поля не заведены'})`),
        );
        return verdict;
    }

    /** Записи списков дополняют поля сделки, но не затирают их конфигурацию. */
    private merge(
        deal: ManagerRefusalReason,
        list: ManagerRefusalReason,
    ): ManagerRefusalReason {
        if (list.recorded) {
            return { ...list, fieldsConfigured: true };
        }
        return {
            ...deal,
            text: deal.text ?? list.text,
            fieldsConfigured: deal.fieldsConfigured || list.fieldsConfigured,
        };
    }

    /** Вердикт в ais — и результат, и маркер идемпотентности. */
    private async persist(
        domain: string,
        candidate: RefusalCandidate,
        verdict: RefusalVerdict,
    ): Promise<void> {
        await this.aiService.create({
            provider: 'call-report-auditor',
            model: 'call-report-auditor',
            type: CALL_REFUSAL_AUDIT_TYPE,
            status: 'done',
            result: verdict.note,
            user_result: JSON.parse(JSON.stringify(verdict)) as never,
            domain,
            app: 'call-report',
            transcription_id: candidate.transcriptionId,
        });
    }

    /**
     * Четыре поля карточки разбора: AI · менеджер · расхождение ·
     * объяснение. Fail-open: смарт не установлен или элемент не найден —
     * вердикт всё равно лежит в ais.
     */
    private async writeToSmart(
        domain: string,
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        candidate: RefusalCandidate,
        manager: ManagerRefusalReason,
        verdict: RefusalVerdict,
    ): Promise<void> {
        if (!candidate.activityId) return;
        const smartInfo = await this.smartResolver.resolve(domain);
        if (!smartInfo) return;
        const writer = new CallReportSmartWriterService(bitrix, smartInfo);
        await writer
            .updateExisting({
                activityId: candidate.activityId,
                refusalReasonAi: verdict.aiReason ?? undefined,
                // Пустое поле нельзя отличить от «ещё не сверяли», поэтому
                // отсутствие причины пишется явным текстом (как «менеджер
                // не отчитался» у хвоста/5К).
                refusalReasonManager: manager.recorded
                    ? (manager.text ?? undefined)
                    : manager.fieldsConfigured
                      ? MANAGER_REFUSAL_REASON_MISSING
                      : MANAGER_REFUSAL_FIELDS_MISSING,
                refusalMismatch: verdict.mismatch,
                refusalReasonNote: verdict.note,
            })
            .catch((error: Error) =>
                this.logger.warn(
                    `Причина отказа не записана в элемент (activity ${candidate.activityId}): ${error.message}`,
                ),
            );
    }
}
