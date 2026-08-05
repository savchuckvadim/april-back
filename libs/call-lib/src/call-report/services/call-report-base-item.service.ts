import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import { BitrixService } from '@lib/bitrix';
import { CallAnalysisBitrixService } from '../../call-analysis/services/call-analysis-bitrix.service';
import { AiService } from '../../ai/services/ai.service';
import { AiEntityDto } from '../../ai/dto/ai-entity.dto';
import {
    CALL_RECOMENDATION_TYPE,
    CALL_RESUME_TYPE,
} from '../../ai/ai-record-types.const';
import { TranscriptionStoreService } from '../../transcription/services/transcription.store.service';
import { CallReportSmartResolverService } from './call-report-smart-resolver.service';
import { CallReportSmartWriterService } from './call-report-smart-writer.service';

/**
 * Базовый смарт-элемент по обработанной транскрипции — БЕЗ глубокого анализа
 * агента: идентификация звонка, связи (сделка/лид, компания, контакт,
 * менеджер), транскрипт, gigachat-резюме/рекомендации, тип от классификатора,
 * привязка записи звонка (binding активности — родной плеер в таймлайне).
 *
 * Используется smoke-ручкой полного flow (POST /call-report/analyze с
 * createSmartItem=true). Агент потом ДОПОЛНЯЕТ тот же элемент глубокими
 * полями — writer работает upsert-ом по xmlId, дублей не будет.
 */
@Injectable()
export class CallReportBaseItemService {
    private readonly logger = new Logger(CallReportBaseItemService.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly smartResolver: CallReportSmartResolverService,
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly aiService: AiService,
    ) {}

    /** id созданного/обновлённого элемента; null — смарт не установлен. */
    async createBaseItem(
        transcriptionId: string,
        callType: string | null,
    ): Promise<number | null> {
        const row =
            await this.transcriptionStore.findPipelineById(transcriptionId);
        if (!row.domain) return null;
        const domain = row.domain;

        const smartInfo = await this.smartResolver.resolve(domain);
        if (!smartInfo) {
            this.logger.warn(
                `Смарт не установлен на ${domain} — базовый элемент не создан`,
            );
            return null;
        }

        const { bitrix } = await this.pbxService.init(domain);
        const bx = new CallAnalysisBitrixService(bitrix);
        const activity = row.activityId
            ? await bx.getActivityById(Number(row.activityId)).catch(() => null)
            : null;

        const isLead = row.entityType === 'lead';
        const entityId = row.entityId ? Number(row.entityId) : undefined;
        const context = await this.loadContext(
            bitrix,
            isLead ? 'lead' : 'deal',
            row.entityId,
        );
        const gigachat = await this.loadGigachat(transcriptionId);

        const writer = new CallReportSmartWriterService(bitrix, smartInfo);
        const itemId = await writer.addItem({
            activityId: row.activityId ?? '',
            dealId: isLead ? undefined : entityId,
            leadId: isLead ? entityId : undefined,
            mainDealId: isLead ? undefined : entityId,
            companyId: context.companyId,
            contactId: context.contactId,
            managerId: context.managerId,
            callId: row.callId ?? undefined,
            callStartedAt: row.callStartedAt ?? undefined,
            callDirection: this.resolveDirection(activity),
            durationSec: row.durationSec ? Number(row.durationSec) : undefined,
            callType: callType ?? undefined,
            transcriptionId: row.id,
            transcript: row.text ?? undefined,
            resumeGigachat: gigachat.resume,
            recomendationGigachat: gigachat.recomendation,
            // SUMMARY («Резюме звонка») намеренно НЕ заполняется: это поле
            // глубокого разбора (intake запишет dto.summary). Суррогат из
            // gigachat давал в карточке два одинаковых резюме подряд.
        });

        // Родная запись звонка (плеер) в таймлайне элемента — fail-open.
        if (row.activityId) {
            await bitrix.activity
                .addBinding(
                    Number(row.activityId),
                    smartInfo.entityTypeId,
                    itemId,
                )
                .catch((error: Error) =>
                    this.logger.warn(
                        `binding активности ${row.activityId} не выполнен: ${error.message}`,
                    ),
                );
        }
        this.logger.log(
            `Базовый смарт-элемент #${itemId} (transcription ${transcriptionId}, ${domain})`,
        );
        return itemId;
    }

    private resolveDirection(
        activity: unknown,
    ): 'incoming' | 'outgoing' | undefined {
        const direction = Number(
            (activity as { DIRECTION?: string | number } | null)?.DIRECTION,
        );
        if (direction === 2) return 'outgoing';
        if (direction === 1) return 'incoming';
        return undefined;
    }

    private async loadGigachat(transcriptionId: string): Promise<{
        resume?: string;
        recomendation?: string;
    }> {
        // Тип возврата у catch задан явно: без него пустой литерал даёт
        // never[], union схлопывает элемент find() в never и ломает сборку.
        const records = await this.aiService
            .findByTranscriptionIds([transcriptionId])
            .catch((): AiEntityDto[] => []);
        return {
            resume:
                records.find(record => record.type === CALL_RESUME_TYPE)
                    ?.result ?? undefined,
            recomendation:
                records.find(record => record.type === CALL_RECOMENDATION_TYPE)
                    ?.result ?? undefined,
        };
    }

    /** Компания/контакт/ответственный владельца звонка (fail-open). */
    private async loadContext(
        bitrix: BitrixService,
        entityType: 'deal' | 'lead',
        entityId: string | null,
    ): Promise<{ companyId?: number; contactId?: number; managerId?: number }> {
        if (!entityId) return {};
        try {
            const method =
                entityType === 'lead' ? 'crm.lead.get' : 'crm.deal.get';
            const response = (await bitrix.api.call(method, {
                id: entityId,
            })) as {
                result?: {
                    COMPANY_ID?: string | number;
                    CONTACT_ID?: string | number;
                    ASSIGNED_BY_ID?: string | number;
                };
            };
            const entity = response?.result;
            if (!entity) return {};
            return {
                companyId: Number(entity.COMPANY_ID) || undefined,
                contactId: Number(entity.CONTACT_ID) || undefined,
                managerId: Number(entity.ASSIGNED_BY_ID) || undefined,
            };
        } catch (error) {
            this.logger.warn(
                `${entityType} ${entityId}: контекст не получен: ${(error as Error).message}`,
            );
            return {};
        }
    }
}
