import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { PBXService } from '@lib/pbx/pbx.service';
import { BitrixService } from '@lib/bitrix';
import {
    AiService,
    CallReportSmartResolverService,
    TranscriptionPipelineView,
} from '@lib/call-lib';
import {
    EnumPortalAppCode,
    parseUserIds,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import {
    AI_ANALYTICS_FEEDBACK_APP,
    AI_ANALYTICS_FEEDBACK_PROVIDER,
    AI_ANALYTICS_FEEDBACK_TYPE,
    AiAnalyticsFeedbackKind,
    AiAnalyticsFeedbackPayload,
} from '@lib/sales-ai-analytics';
import { AgentCallAnalysisDto } from '../../agent-gate/dto/agent-analysis-request.dto';
import {
    buildAlertLink,
    buildAlertMessage,
    CallReportAlertKind,
    pickAlertQuote,
    resolveAlertKind,
} from './call-report-alert-message.util';

/** Итог попытки алерта — для логов и тестов. */
export interface CallReportAlertOutcome {
    status: 'sent' | 'skipped' | 'failed';
    kind: CallReportAlertKind | null;
    /** Кому уведомление реально ушло. */
    delivered: number[];
    reason?: string;
}

/** Вид записи доставки; типизирован справочником kind'ов контракта. */
const ALERT_SENT_KIND: AiAnalyticsFeedbackKind = 'alert_sent';
/** Объект записи — звонок (конвенция контракта: 'call:<transcriptionId>'). */
const alertObject = (transcriptionId: string): string =>
    `call:${transcriptionId}`;
/** TAG уведомления: повтор по тому же звонку замещает, а не дублирует. */
const NOTIFY_TAG_PREFIX = 'call-report-alert';

/**
 * Алерт РОПу в день звонка (Фаза 1a плана ai/tasks/ai-sales-analytics-plan.md,
 * день 6–7): после записи разбора с риск-флагом (обещание, конфликт,
 * регламент, негатив клиента) или срочным приоритетом коучинга —
 * уведомление каждому РОПу из настроек kpiSales с менеджером, типом
 * звонка, видом сигнала, цитатой и ссылкой на разбор.
 *
 * Один звонок — один алерт: перед отправкой ищется ais-запись
 * ai-analytics-feedback kind='alert_sent' по transcription_id, после
 * отправки такая запись пишется (payload: вид алерта и получатели).
 *
 * Fail-open: любая ошибка (настройки, Bitrix, БД) — warn и skip, разбор
 * уже записан и джоб конвейера не страдает.
 */
@Injectable()
export class CallReportAlertService {
    private readonly logger = new Logger(CallReportAlertService.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly appSettings: PortalAppSettingsService,
        private readonly aiService: AiService,
        private readonly smartResolver: CallReportSmartResolverService,
    ) {}

    async notifyIfNeeded(
        domain: string,
        analysis: AgentCallAnalysisDto,
        row: TranscriptionPipelineView,
        smartItemId: number | null,
    ): Promise<CallReportAlertOutcome> {
        const kind = resolveAlertKind(analysis);
        if (!kind)
            return {
                status: 'skipped',
                kind: null,
                delivered: [],
                reason: 'no-risk',
            };
        try {
            const settings = await this.appSettings.resolve(
                domain,
                EnumPortalAppCode.kpiSales,
            );
            if (!settings.aiAnalyticsAlertsEnabled) {
                return this.skip(kind, 'alerts-disabled');
            }
            const ropUserIds = parseUserIds(settings.aiAnalyticsRopUserIds);
            if (!ropUserIds.length) {
                this.logger.warn(
                    `Алерты включены на ${domain}, но РОПы не заданы (ai_analytics_rop_user_ids) — сигнал ${kind} по звонку ${row.id} не отправлен`,
                );
                return this.skip(kind, 'no-rop');
            }
            if (await this.alreadySent(row.id)) {
                return this.skip(kind, 'already-sent');
            }

            const { bitrix } = await this.pbxService.init(domain);
            const message = buildAlertMessage({
                managerName: await this.resolveManagerName(bitrix, row.userId),
                callType: analysis.callType ?? null,
                kind,
                quote: pickAlertQuote(analysis),
                link: buildAlertLink({
                    domain,
                    smartEntityTypeId:
                        await this.resolveSmartEntityTypeId(domain),
                    smartItemId,
                    entityType: row.entityType,
                    entityId: row.entityId,
                }),
            });
            const delivered = await this.notify(
                bitrix,
                ropUserIds,
                message,
                row.id,
            );
            if (!delivered.length) {
                return {
                    status: 'failed',
                    kind,
                    delivered,
                    reason: 'not-delivered',
                };
            }
            await this.recordSent(domain, row, kind, delivered);
            this.logger.log(
                `Алерт ${kind} по звонку ${row.id} (${domain}) ушёл РОПам ${delivered.join(', ')}`,
            );
            return { status: 'sent', kind, delivered };
        } catch (error) {
            this.logger.warn(
                `Алерт ${kind} по звонку ${row.id} (${domain}) не отправлен: ${(error as Error).message}`,
            );
            return {
                status: 'failed',
                kind,
                delivered: [],
                reason: (error as Error).message,
            };
        }
    }

    private skip(
        kind: CallReportAlertKind,
        reason: string,
    ): CallReportAlertOutcome {
        return { status: 'skipped', kind, delivered: [], reason };
    }

    /** Идемпотентность: запись alert_sent по звонку уже есть. */
    private async alreadySent(transcriptionId: string): Promise<boolean> {
        const records = await this.aiService.findByTranscriptionIds([
            transcriptionId,
        ]);
        return records.some(
            record =>
                record.type === AI_ANALYTICS_FEEDBACK_TYPE &&
                readFeedbackKind(record.user_result) === ALERT_SENT_KIND,
        );
    }

    /** Уведомление каждому РОПу; сбой по одному не мешает остальным. */
    private async notify(
        bitrix: BitrixService,
        userIds: number[],
        message: string,
        transcriptionId: string,
    ): Promise<number[]> {
        const delivered: number[] = [];
        for (const userId of userIds) {
            try {
                await bitrix.imNotify.systemAdd({
                    USER_ID: userId,
                    MESSAGE: message,
                    TAG: `${NOTIFY_TAG_PREFIX}:${transcriptionId}`,
                });
                delivered.push(userId);
            } catch (error) {
                this.logger.warn(
                    `Алерт не доставлен пользователю ${userId}: ${(error as Error).message}`,
                );
            }
        }
        return delivered;
    }

    /** Запись доставки — маркер «алерт по звонку уже был». */
    private async recordSent(
        domain: string,
        row: TranscriptionPipelineView,
        kind: CallReportAlertKind,
        delivered: number[],
    ): Promise<void> {
        const userResult: AiAnalyticsFeedbackPayload = {
            kind: ALERT_SENT_KIND,
            object: alertObject(row.id),
            managerId: row.userId ?? null,
            transcriptionId: row.id,
            requesterUserId: null,
            reason: null,
            payload: { alertKind: kind, ropUserIds: delivered },
        };
        await this.aiService.create({
            provider: AI_ANALYTICS_FEEDBACK_PROVIDER,
            app: AI_ANALYTICS_FEEDBACK_APP,
            type: AI_ANALYTICS_FEEDBACK_TYPE,
            status: 'done',
            result: `${ALERT_SENT_KIND}: ${kind}`,
            user_result: JSON.parse(
                JSON.stringify(userResult),
            ) as Prisma.JsonValue,
            domain,
            transcription_id: row.id,
            activity_id: row.activityId ?? undefined,
            entity_type: row.entityType ?? undefined,
            entity_id: row.entityId ? Number(row.entityId) : undefined,
        });
    }

    /** «Фамилия Имя» менеджера звонка; без имени — «#id», без id — «не определён». */
    private async resolveManagerName(
        bitrix: BitrixService,
        userId: string | null,
    ): Promise<string> {
        if (!userId) return 'не определён';
        try {
            const response = await bitrix.user.get({ ID: userId });
            const user = response?.result?.[0];
            const name = [user?.LAST_NAME, user?.NAME]
                .filter((part): part is string => Boolean(part?.trim()))
                .join(' ');
            return name || `#${userId}`;
        } catch (error) {
            this.logger.warn(
                `Имя менеджера ${userId} не прочитано: ${(error as Error).message}`,
            );
            return `#${userId}`;
        }
    }

    /** entityTypeId смарта для ссылки на карточку разбора; нет смарта — null. */
    private async resolveSmartEntityTypeId(
        domain: string,
    ): Promise<number | null> {
        try {
            return (
                (await this.smartResolver.resolve(domain))?.entityTypeId ?? null
            );
        } catch (error) {
            this.logger.warn(
                `Смарт «AI-анализ звонков» не резолвится (${domain}): ${(error as Error).message}`,
            );
            return null;
        }
    }
}

/** kind из user_result ais-записи (JSON произвольной формы). */
function readFeedbackKind(userResult: unknown): string | null {
    if (typeof userResult !== 'object' || userResult === null) return null;
    const kind = (userResult as { kind?: unknown }).kind;
    return typeof kind === 'string' ? kind : null;
}
