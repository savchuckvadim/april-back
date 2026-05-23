import { Logger } from '@nestjs/common';
import {
    BitrixActivityTypeId,
    BitrixOwnerTypeId,
    BitrixService,
} from '@/modules/bitrix';
import { IBXActivity } from '@/modules/bitrix/domain/activity/interfaces/bx-activity.interface';
import {
    ETaskPriority,
    ITaskChecklistItem,
} from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { CallSalesAnalysisResultDto } from '../dto/call-sales-analysis.dto';

export interface AudioFile {
    activityId: number;
    fileId: number;
    downloadUrl: string;
    fileName: string;
}

export class CallAnalysisBitrixService {
    private readonly logger = new Logger(CallAnalysisBitrixService.name);

    constructor(private readonly bitrix: BitrixService) {}

    async getCallActivities(
        dealId: number,
        limit = 10,
    ): Promise<IBXActivity[]> {
        const result = await this.bitrix.activity.getAllFresh(
            {
                OWNER_TYPE_ID: BitrixOwnerTypeId.DEAL,
                OWNER_ID: dealId,
                TYPE_ID: BitrixActivityTypeId.CALL,
            },
            undefined,
            limit,
        );
        return result.activities;
    }

    async getActivityById(activityId: number): Promise<IBXActivity | null> {
        const result = await this.bitrix.activity.getAllFresh(
            { ID: activityId },
            undefined,
            1,
        );
        return result.activities[0] ?? null;
    }

    async getAudioFiles(activities: IBXActivity[]): Promise<AudioFile[]> {
        const fileMap: Record<number, Omit<AudioFile, 'downloadUrl'>> = {};

        for (const activity of activities) {
            if (!activity.FILES?.length) continue;
            for (const file of activity.FILES) {
                const fileId = Number(file.id);
                fileMap[fileId] = {
                    activityId: Number(activity.ID),
                    fileId,
                    fileName: `call_${activity.ID}_${fileId}.mp3`,
                };
            }
        }

        if (!Object.keys(fileMap).length) return [];

        for (const fileId of Object.keys(fileMap)) {
            this.bitrix.batch.file.get(fileId, fileId);
        }

        const responses = await this.bitrix.api.callBatchWithConcurrency(3);
        const audioFiles: AudioFile[] = [];

        for (const response of responses) {
            for (const [fileId, fileData] of Object.entries(
                response.result as Record<string, { DOWNLOAD_URL?: string }>,
            )) {
                const meta = fileMap[Number(fileId)];
                if (!meta || !fileData.DOWNLOAD_URL) continue;
                audioFiles.push({
                    ...meta,
                    downloadUrl: fileData.DOWNLOAD_URL,
                });
            }
        }

        return audioFiles;
    }

    async downloadAudioBuffer(downloadUrl: string): Promise<Buffer> {
        const response = await fetch(downloadUrl);
        if (!response.ok) {
            throw new Error(
                `Failed to download audio [${response.status}]: ${downloadUrl}`,
            );
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    async getDealResponsibleId(dealId: number): Promise<number> {
        const result = await this.bitrix.deal.getList({ ID: dealId }, [
            'ID',
            'ASSIGNED_BY_ID',
        ]);
        const deal = result.result?.[0];
        if (!deal) throw new Error(`Deal ${dealId} not found`);
        const responsibleId = Number(deal.ASSIGNED_BY_ID);
        if (!responsibleId) {
            throw new Error(
                `Deal ${dealId} has no responsible user (ASSIGNED_BY_ID is empty)`,
            );
        }
        return responsibleId;
    }

    async saveAnalysisToTimeline(
        dealId: number,
        analysis: CallSalesAnalysisResultDto,
        transcript: string,
        activityId: number,
        responsibleId: number,
    ): Promise<void> {
        const sentiment =
            analysis.clientSentiment === 'positive'
                ? '😊 Позитивное'
                : analysis.clientSentiment === 'negative'
                  ? '😟 Негативное'
                  : '😐 Нейтральное';

        const comment =
            `📞 [b]AI-анализ звонка[/b] (активность #${activityId})\n\n` +
            `[b]Итог:[/b] ${analysis.wasProductive ? '✅ Результативный' : '❌ Нерезультативный'}\n` +
            `[b]Результат:[/b] ${analysis.callOutcome}\n` +
            `[b]Настроение клиента:[/b] ${sentiment}\n\n` +
            `[b]Резюме:[/b]\n${analysis.summary}\n\n` +
            (analysis.keyPoints.length
                ? `[b]Ключевые моменты:[/b]\n${analysis.keyPoints.map(p => `• ${p}`).join('\n')}\n\n`
                : '') +
            (analysis.objections.length
                ? `[b]Возражения:[/b]\n${analysis.objections.map(o => `• ${o}`).join('\n')}\n\n`
                : '') +
            (analysis.agreedActions.length
                ? `[b]Договорённости:[/b]\n${analysis.agreedActions.map(a => `• ${a}`).join('\n')}\n\n`
                : '') +
            (analysis.nextCallPlanned
                ? `[b]Следующий контакт:[/b] ${analysis.nextCallDate ?? 'дата не указана'}\n` +
                  (analysis.nextCallGoal
                      ? `Цель: ${analysis.nextCallGoal}\n`
                      : '')
                : '') +
            `\n[b]Расшифровка:[/b]\n[i]${transcript.slice(0, 1500)}${transcript.length > 1500 ? '...' : ''}[/i]`;

        await this.bitrix.timeline.addTimelineComment({
            ENTITY_ID: dealId,
            ENTITY_TYPE: 'deal',
            COMMENT: comment,
            AUTHOR_ID: String(responsibleId),
        });

        this.logger.log(
            `Timeline comment saved for deal ${dealId}, activity ${activityId}`,
        );
    }

    async createConfirmationTask(
        dealId: number,
        responsibleId: number,
        analysis: CallSalesAnalysisResultDto,
        activityId: number,
    ): Promise<number> {
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 1);

        const description =
            `Проверьте и подтвердите результат звонка (активность #${activityId}).\n\n` +
            `[b]Резюме:[/b] ${analysis.summary}\n\n` +
            `[b]Итог:[/b] ${analysis.callOutcome}\n` +
            `[b]Следующий контакт:[/b] ${analysis.nextCallPlanned ? (analysis.nextCallDate ?? 'запланирован, дата не указана') : 'не запланирован'}\n\n` +
            `Отметьте пункты чеклиста и завершите задачу для подтверждения.`;

        const checklist: ITaskChecklistItem[] = [
            {
                TITLE: 'Звонок был результативным',
                IS_COMPLETE: analysis.wasProductive ? 'Y' : 'N',
            },
            {
                TITLE: 'Следующий контакт запланирован',
                IS_COMPLETE: analysis.nextCallPlanned ? 'Y' : 'N',
            },
            {
                TITLE: 'Данные AI-анализа проверены и верны — подтверждаю',
                IS_COMPLETE: 'N',
            },
        ];

        const taskResult = await this.bitrix.task.add({
            TITLE: `Подтвердите результат звонка #${activityId}`,
            RESPONSIBLE_ID: responsibleId,
            CREATED_BY: responsibleId,
            DESCRIPTION: description,
            UF_CRM_TASK: [`D_${dealId}`],
            DEADLINE: deadline.toISOString(),
            PRIORITY: ETaskPriority.MEDIUM,
            CHECKLIST: checklist,
        });

        const taskId = Number(
            taskResult?.result?.task?.id ?? taskResult?.result,
        );
        if (!taskId) {
            this.logger.warn('Could not get task ID from response');
            return 0;
        }

        this.logger.log(
            `Confirmation task ${taskId} created for deal ${dealId} with ${checklist.length} checklist items`,
        );
        return taskId;
    }

    async notifyResponsible(
        responsibleId: number,
        taskId: number,
        analysis: CallSalesAnalysisResultDto,
        activityId: number,
    ): Promise<void> {
        const taskLink =
            taskId > 0
                ? `\n\n[url=/company/personal/user/${responsibleId}/tasks/task/view/${taskId}/]👉 Открыть задачу подтверждения[/url]`
                : '';

        const message =
            `🤖 [b]AI-анализ звонка завершён[/b] (активность #${activityId})\n\n` +
            `[b]Итог:[/b] ${analysis.wasProductive ? '✅ Результативный' : '❌ Нерезультативный'} — ${analysis.callOutcome}\n` +
            `[b]Резюме:[/b] ${analysis.summary}` +
            taskLink;

        await this.bitrix.message.add({
            DIALOG_ID: String(responsibleId),
            MESSAGE: message,
            SYSTEM: 'N',
            URL_PREVIEW: 'Y',
        });

        this.logger.log(`IM notification sent to user ${responsibleId}`);
    }
}
