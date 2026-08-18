import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { IBXListItemFields } from '@/modules/bitrix/domain/list-item/interface/bx-list-item.interface';
import { IPBXList } from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    EnumOrkEventAction,
    EnumOrkEventCommunication,
    EnumOrkEventInitiative,
    EnumOrkEventType,
    EnumOrkResultStatus,
} from '@lib/portal-lib/pbx/pbx-ork-history-bx-list';
import { OrkFieldResolver } from '../../call-event/services/ork/ork-field.resolver';
import { OrkHistoryElementBuilder } from '../../call-event/services/history/ork-history-element.builder';
import { SsRestoreSessionCandidate } from '../types/ss-restore.types';
import { SS_RESTORE_TAG, companyOnlyLinks } from '../lib/ss-restore.util';

export interface SsWriteOutcome {
    applied: { taskId: number; elementId: number | string }[];
    failed: { taskId: number; error: string }[];
    skippedAlreadyExists: number[];
}

interface BatchChunkResult {
    result?: Record<string, unknown>;
    result_error?:
        | Record<string, { error?: string; error_description?: string }>
        | [];
}

const ALREADY_EXISTS = 'ERROR_ELEMENT_ALREADY_EXISTS';

/**
 * Запись восстановленных элементов «Сервисный сигнал Состоялся». Идемпотентно:
 * ELEMENT_CODE детерминирован (`…_ss_restore_<taskId>`), повторная попытка
 * получает ERROR_ELEMENT_ALREADY_EXISTS и трактуется как «уже восстановлено».
 */
export class SsRestoreWriter {
    private readonly logger = new Logger(SsRestoreWriter.name);
    private readonly builder: OrkHistoryElementBuilder;

    constructor(
        private readonly bitrix: BitrixService,
        private readonly list: IPBXList,
    ) {
        this.builder = new OrkHistoryElementBuilder(new OrkFieldResolver(list));
    }

    elementCode(taskId: number): string {
        return `${this.list.group}_${this.list.type}_ss_restore_${taskId}`;
    }

    async write(
        candidates: SsRestoreSessionCandidate[],
    ): Promise<SsWriteOutcome> {
        const outcome: SsWriteOutcome = {
            applied: [],
            failed: [],
            skippedAlreadyExists: [],
        };
        if (!candidates.length || !this.list.bitrixId) return outcome;

        const cmdToTask = new Map<string, number>();
        for (const candidate of candidates) {
            const cmd = `restore_${candidate.taskId}`;
            cmdToTask.set(cmd, candidate.taskId);
            this.bitrix.batch.listItem.add(cmd, {
                IBLOCK_ID: this.list.bitrixId.toString(),
                ELEMENT_CODE: this.elementCode(candidate.taskId),
                FIELDS: this.buildFields(candidate),
            });
        }

        // strict: молча выпавший чанк = оператор считает строки записанными
        const chunks = (await this.bitrix.api.callBatchWithConcurrency(1, {
            strict: true,
        })) as BatchChunkResult[];

        for (const chunk of chunks) {
            for (const [cmd, value] of Object.entries(chunk.result ?? {})) {
                const taskId = cmdToTask.get(cmd);
                if (taskId === undefined) continue;
                outcome.applied.push({
                    taskId,
                    elementId: value as number | string,
                });
            }
            const errors = chunk.result_error;
            if (errors && !Array.isArray(errors)) {
                for (const [cmd, err] of Object.entries(errors)) {
                    const taskId = cmdToTask.get(cmd);
                    if (taskId === undefined) continue;
                    if (err?.error === ALREADY_EXISTS) {
                        outcome.skippedAlreadyExists.push(taskId);
                    } else {
                        outcome.failed.push({
                            taskId,
                            error: `${err?.error ?? 'ERROR'}: ${err?.error_description ?? ''}`,
                        });
                    }
                }
            }
        }

        this.logger.log(
            `ss-restore: записано ${outcome.applied.length}, ` +
                `уже существовало ${outcome.skippedAlreadyExists.length}, ` +
                `ошибок ${outcome.failed.length}`,
        );
        return outcome;
    }

    private buildFields(
        candidate: SsRestoreSessionCandidate,
    ): IBXListItemFields {
        const fields = this.builder.build({
            name: 'Сервисный сигнал Состоялся',
            eventTypeCode: EnumOrkEventType.et_ork_signal,
            eventActionCode: EnumOrkEventAction.ea_ork_done,
            communicationCode: EnumOrkEventCommunication.ec_ork_signal,
            initiativeCode: EnumOrkEventInitiative.ei_ork_incoming,
            resultStatusCode: EnumOrkResultStatus.ork_call_result_yes,
            responsibleId: candidate.responsibleId || undefined,
            date: candidate.elementDate,
            comment: candidate.comment,
            crmLinks: candidate.ufCrmTask,
            companyLink: companyOnlyLinks(
                candidate.ufCrmTask,
                candidate.companyId,
            ),
            contactId: candidate.contactId ?? undefined,
            tagValue: SS_RESTORE_TAG,
        });
        return fields as unknown as IBXListItemFields;
    }
}
