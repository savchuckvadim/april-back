import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import {
    renderSalesListRecordLine,
    SalesListReaderService,
} from '@lib/portal-lib/pbx/pbx-sales-list-reader';
import { AiService, TranscriptionStoreService } from '@lib/call-lib';
import { CallReportSmartResolverService } from '@lib/call-lib/call-report/services/call-report-smart-resolver.service';
import { VibeCodeClient, VibeKeyResolverService } from '@lib/vibecode';
import { AGENT_ANALYSIS_TYPE } from '../../agent-gate/services/agent-call-package.service';
import { AgentCallAnalysisDto } from '../../agent-gate/dto/agent-analysis-request.dto';
import {
    buildPresentationAuditUserContent,
    PRESENTATION_AUDIT_PROMPT,
    PRESENTATION_AUDIT_SCHEMA,
} from '../contracts/presentation-audit.contract';

/** Итог сверки одного домена. */
export interface PresentationAuditDomainResult {
    domain: string;
    /** Кандидатов (разборов презентаций/решений в окне). */
    candidates: number;
    /** Сверено (записи в таймлайн). */
    audited: number;
    /** Из них с расхождениями. */
    mismatched: number;
    /** Пропущено: уже сверено ранее (идемпотентность). */
    skippedDone: number;
    failed: number;
}

/** Ответ модели-сверщика. */
interface AuditVerdict {
    comparison: string;
    mismatch: boolean;
    mismatchPoints: string[];
}

/** ais-тип записи сверки (и маркер идемпотентности). */
export const PRESENTATION_AUDIT_TYPE = 'presentation-audit';

/** Коды типов события «презентация» в списках отчётности. */
const PRESENTATION_EVENT_TYPE_CODES = [
    'presentation',
    'presentation_uniq',
    'presentation_contact_uniq',
];
/** Окно поиска записей списков вокруг даты звонка, дней. */
const LIST_REPORT_WINDOW_DAYS = 3;

/** Кандидат сверки: разбор + адресация звонка. */
interface AuditCandidate {
    transcriptionId: string;
    dto: AgentCallAnalysisDto;
    itemId: number | null;
    callStartedAt: Date | null;
    managerId: string | null;
}

/**
 * КРОН-СВЕРКА ПО ПРЕЗЕНТАЦИЯМ (Фаза 4, архитектура владельца 15.08.2026):
 * для каждого свежего разбора презентации/решения читает отчёт менеджера
 * из полей сделки-презентации («ОП Хвост», «ОП Пять К», «ОП Комментарии
 * после презентаций» — реестр pbx-sales-event-field) и сверяет одним
 * LLM-вызовом. Итог: «⚖️ Сверка с отчётом менеджера» в таймлайн
 * смарт-элемента; при расхождении — дубль в таймлайн сделки.
 *
 * Идемпотентность: ais-запись type='presentation-audit' на транскрипцию;
 * повторный прогон уже сверенные пропускает. Fail-open по сущности.
 */
@Injectable()
export class PresentationAuditService {
    private readonly logger = new Logger(PresentationAuditService.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly aiService: AiService,
        private readonly smartResolver: CallReportSmartResolverService,
        private readonly vibeCodeClient: VibeCodeClient,
        private readonly vibeKeyResolver: VibeKeyResolverService,
    ) {}

    async runForDomain(
        domain: string,
        from: Date,
        to: Date,
        maxEntities = 20,
    ): Promise<PresentationAuditDomainResult> {
        const result: PresentationAuditDomainResult = {
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

        // Кандидаты: разборы презентаций/решений без выполненной сверки.
        const candidates: AuditCandidate[] = [];
        for (const row of rows) {
            const forRow = records.filter(
                record => String(record.transcription_id) === row.id,
            );
            if (
                forRow.some(record => record.type === PRESENTATION_AUDIT_TYPE)
            ) {
                result.skippedDone++;
                continue;
            }
            const analysis = forRow.find(
                record => record.type === AGENT_ANALYSIS_TYPE,
            );
            const dto = analysis?.user_result as AgentCallAnalysisDto | null;
            if (!dto?.callType) continue;
            if (!['presentation', 'decision'].includes(dto.callType)) continue;
            candidates.push({
                transcriptionId: row.id,
                dto,
                itemId: analysis?.report_item_id
                    ? Number(analysis.report_item_id)
                    : null,
                callStartedAt: row.callStartedAt
                    ? new Date(row.callStartedAt)
                    : null,
                managerId: row.userId ?? null,
            });
        }
        result.candidates = candidates.length;

        for (const candidate of candidates.slice(0, maxEntities)) {
            try {
                const mismatch = await this.auditOne(domain, candidate);
                result.audited++;
                if (mismatch) result.mismatched++;
            } catch (error) {
                result.failed++;
                this.logger.warn(
                    `Сверка транскрипции ${candidate.transcriptionId} (${domain}) не удалась: ${(error as Error).message}`,
                );
            }
        }
        this.logger.log(
            `Сверка презентаций (${domain}): кандидатов ${result.candidates}, ` +
                `сверено ${result.audited}, расхождений ${result.mismatched}, ` +
                `уже сверено ${result.skippedDone}, ошибок ${result.failed}`,
        );
        return result;
    }

    /** Сверка одного разбора; возвращает mismatch. */
    private async auditOne(
        domain: string,
        candidate: AuditCandidate,
    ): Promise<boolean> {
        const { bitrix, PortalModel: portal } =
            await this.pbxService.init(domain);
        const dto = candidate.dto;

        // Сделка-отчёт: связанная презентация из разбора, иначе основная.
        const dealId =
            dto.relatedDeals?.presentationDealId ??
            dto.relatedDeals?.mainDealId ??
            null;
        const managerReport = await this.readManagerReport(
            bitrix,
            portal,
            dealId,
        );
        const listReports = await this.readListReports(
            bitrix,
            portal,
            dealId,
            candidate,
        );

        const apiKey = await this.vibeKeyResolver.resolve(domain);
        const verdict = (await this.vibeCodeClient.structuredCompletion(
            PRESENTATION_AUDIT_PROMPT,
            buildPresentationAuditUserContent({
                analysisDigest: this.renderAnalysisDigest(dto),
                managerReport,
                listReports,
            }),
            'presentation_audit',
            PRESENTATION_AUDIT_SCHEMA,
            apiKey,
        )) as AuditVerdict;

        // Запись сверки в ais — и результат, и маркер идемпотентности.
        await this.aiService.create({
            provider: 'call-report-auditor',
            model: 'call-report-auditor',
            type: PRESENTATION_AUDIT_TYPE,
            status: 'done',
            result: verdict.comparison,
            user_result: JSON.parse(JSON.stringify(verdict)) as never,
            domain,
            app: 'call-report',
            transcription_id: candidate.transcriptionId,
        });

        const comment =
            `⚖️ [b]Сверка с отчётом менеджера[/b]` +
            `${verdict.mismatch ? ' — ЕСТЬ РАСХОЖДЕНИЯ' : ''}\n\n` +
            verdict.comparison.slice(0, 8000);

        const smartInfo = await this.smartResolver.resolve(domain);
        if (candidate.itemId && smartInfo) {
            await bitrix.timeline
                .addTimelineComment({
                    ENTITY_ID: candidate.itemId,
                    ENTITY_TYPE: `DYNAMIC_${smartInfo.entityTypeId}`,
                    COMMENT: comment,
                    AUTHOR_ID: '1',
                })
                .catch((error: Error) =>
                    this.logger.warn(
                        `Сверка не запощена в элемент #${candidate.itemId}: ${error.message}`,
                    ),
                );
        }
        if (verdict.mismatch && dealId) {
            await bitrix.timeline
                .addTimelineComment({
                    ENTITY_ID: dealId,
                    ENTITY_TYPE: 'deal',
                    COMMENT: comment,
                    AUTHOR_ID: '1',
                })
                .catch((error: Error) =>
                    this.logger.warn(
                        `Сверка не запощена в сделку #${dealId}: ${error.message}`,
                    ),
                );
        }
        return verdict.mismatch;
    }

    /**
     * Второй источник отчёта менеджера — записи списков отчётности (КПИ и
     * ОП История) с типом события «Презентация» через «робота»
     * SalesListReaderService: сначала записи, ПРИВЯЗАННЫЕ к сделке
     * CRM-полем, иначе — записи менеджера в окне ±LIST_REPORT_WINDOW_DAYS
     * вокруг даты звонка. null — записей не нашли (тоже результат:
     * «не отчитался» ставится только когда пусто везде). Fail-open.
     */
    private async readListReports(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        portal: PortalModel,
        dealId: number | null,
        candidate: AuditCandidate,
    ): Promise<string | null> {
        try {
            const reader = new SalesListReaderService(bitrix, portal);
            const dayMs = 24 * 60 * 60_000;
            const window = candidate.callStartedAt
                ? {
                      dateFrom: new Date(
                          candidate.callStartedAt.getTime() -
                              LIST_REPORT_WINDOW_DAYS * dayMs,
                      ),
                      dateTo: new Date(
                          candidate.callStartedAt.getTime() +
                              LIST_REPORT_WINDOW_DAYS * dayMs,
                      ),
                  }
                : {};

            // Уровень 1: записи, привязанные к сделке CRM-полем.
            let records = dealId
                ? await reader.readBoth({
                      crmRefs: [`D_${dealId}`],
                      eventTypeCodes: PRESENTATION_EVENT_TYPE_CODES,
                      ...window,
                      limit: 5,
                  })
                : [];
            // Уровень 2: записи менеджера рядом по времени со звонком.
            if (!records.length && candidate.managerId) {
                records = await reader.readBoth({
                    eventTypeCodes: PRESENTATION_EVENT_TYPE_CODES,
                    responsibleId: candidate.managerId,
                    ...window,
                    limit: 5,
                });
            }
            if (!records.length) return null;
            return records.map(renderSalesListRecordLine).join('\n');
        } catch (error) {
            this.logger.warn(
                `Записи списков для сверки не собраны (${candidate.transcriptionId}): ${(error as Error).message}`,
            );
            return null;
        }
    }

    /** Выжимка разбора для сверки. */
    private renderAnalysisDigest(dto: AgentCallAnalysisDto): string {
        const lines = [
            `Тип звонка: ${dto.callType}`,
            `Резюме: ${dto.summary}`,
            `Хвост пройден: ${this.boolLabel(dto.hvostDone)}`,
            dto.hvostAnalysis ? `Разбор хвоста:\n${dto.hvostAnalysis}` : null,
            `5К закрыто: ${this.boolLabel(dto.fiveKDone)}`,
            dto.fiveKAnalysis ? `Разбор 5К:\n${dto.fiveKAnalysis}` : null,
            `Цена обсуждалась: ${this.boolLabel(dto.priceDiscussed)}`,
            dto.nextStep
                ? `Следующий шаг: ${dto.nextStep.set ? 'назначен' : 'НЕ назначен'}` +
                  (dto.nextStep.description
                      ? ` — ${dto.nextStep.description}`
                      : '')
                : null,
            dto.needs?.length ? `Потребности: ${dto.needs.join('; ')}` : null,
        ];
        return lines.filter(Boolean).join('\n');
    }

    private boolLabel(value: boolean | null | undefined): string {
        if (value === true) return 'да';
        if (value === false) return 'нет';
        return 'не определялось';
    }

    /**
     * Отчёт менеджера из полей сделки: «ОП Хвост», «ОП Пять К»,
     * «ОП Комментарии после презентаций» (реестр pbx-sales-event-field,
     * UF-имена резолвятся через PortalModel). Поля не заведены/пусты —
     * честная строка об этом (это тоже результат сверки).
     */
    private async readManagerReport(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        portal: PortalModel,
        dealId: number | null,
    ): Promise<string> {
        if (!dealId) {
            return 'Сделка-презентация не связана с разбором — отчёт менеджера недоступен.';
        }
        const response = (await bitrix.api.call('crm.deal.get', {
            id: dealId,
        })) as { result?: Record<string, unknown> };
        const deal = response?.result;
        if (!deal) return `Сделка #${dealId} не прочитана.`;

        const readField = (code: string): string | null => {
            try {
                const field = portal.getEntityFieldByCode('deal', code);
                if (!field) return null;
                const raw = deal[portal.getFieldBitrixId(field)];
                if (raw == null || raw === '') return null;
                const toText = (value: unknown): string =>
                    typeof value === 'object'
                        ? JSON.stringify(value)
                        : String(value as string | number | boolean);
                return Array.isArray(raw)
                    ? raw.map(toText).join('\n')
                    : toText(raw);
            } catch {
                return null;
            }
        };

        const xvost = readField(
            PBX_SALES_EVENT_FIELD_CODES.op_presentation_xvost,
        );
        const fiveK = readField(PBX_SALES_EVENT_FIELD_CODES.op_presentation_5k);
        const comments = readField(PBX_SALES_EVENT_FIELD_CODES.pres_comments);

        if (!xvost && !fiveK && !comments) {
            return `Сделка #${dealId}: поля отчёта («ОП Хвост», «ОП Пять К», «ОП Комментарии после презентаций») ПУСТЫ — менеджер не отчитался.`;
        }
        return [
            `Сделка #${dealId}.`,
            xvost ? `ОП Хвост: ${xvost}` : 'ОП Хвост: не заполнено',
            fiveK ? `ОП Пять К: ${fiveK}` : 'ОП Пять К: не заполнено',
            comments
                ? `ОП Комментарии после презентаций:\n${comments}`
                : 'ОП Комментарии: не заполнено',
        ].join('\n');
    }
}
