import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { IPBXList } from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    EnumOrkEventAction,
    EnumOrkEventType,
    EnumOrkFieldCode,
} from '@lib/portal-lib/pbx/pbx-ork-history-bx-list';
import { OrkFieldResolver } from '../../call-event/services/ork/ork-field.resolver';
import {
    extractCrmIds,
    hasDoneInWindow,
    isoToCrmDateTime,
} from '../lib/ss-restore.util';

/** Закрытая задача СС из скана. */
export interface SsScannedTask {
    taskId: number;
    title: string;
    closedDate: string;
    responsibleId: number;
    ufCrmTask: string[];
    companyId: number | null;
    dealId: number | null;
    contactId: number | null;
}

export interface SsCompanySignalRows {
    /** Даты существующих «СС Состоялся» (dd.MM.yyyy HH:mm:ss). */
    doneDates: string[];
    /** «СС Создан»: id + NAME + контакт. */
    created: { id: number; name: string; contactId: number | null }[];
}

interface TaskListRow {
    id?: number | string;
    title?: string;
    closedDate?: string;
    responsibleId?: number | string;
    ufCrmTask?: string[];
}

interface TaskCommentRow {
    ID?: number | string;
    AUTHOR_ID?: number | string;
    POST_MESSAGE?: string;
    POST_DATE?: string;
}

/**
 * Чтения для ss-restore: закрытые задачи группы СС, сигнальные строки
 * ОРК-истории по компании, коммент менеджера из задачи. Plain-класс:
 * инстанс bitrix передаётся снаружи (per-call, правило CLAUDE.md).
 */
export class SsTaskScanner {
    private readonly logger = new Logger(SsTaskScanner.name);
    private readonly resolver: OrkFieldResolver;

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
        private readonly list: IPBXList,
    ) {
        this.resolver = new OrkFieldResolver(list);
    }

    /** Закрытые задачи группы СС за период. */
    async loadClosedTasks(
        groupId: number,
        from: string,
        to?: string,
    ): Promise<SsScannedTask[]> {
        const filter: Record<string, unknown> = {
            GROUP_ID: groupId,
            STATUS: '5',
            '>=CLOSED_DATE': from,
        };
        if (to) filter['<=CLOSED_DATE'] = to;

        const response = await this.bitrix.task.getAll(filter as never, [
            'ID',
            'TITLE',
            'RESPONSIBLE_ID',
            'CLOSED_DATE',
            'UF_CRM_TASK',
            'GROUP_ID',
        ]);
        const rows = (response?.tasks ?? []) as TaskListRow[];

        const tasks: SsScannedTask[] = [];
        for (const row of rows) {
            const taskId = Number(row.id);
            const closedDate = row.closedDate ?? '';
            if (!taskId || !closedDate) continue;
            const ufCrmTask = (row.ufCrmTask ?? []).map(String);
            const { companyId, dealId, contactId } = extractCrmIds(ufCrmTask);
            tasks.push({
                taskId,
                title: String(row.title ?? ''),
                closedDate,
                responsibleId: Number(row.responsibleId ?? 0),
                ufCrmTask,
                companyId,
                dealId,
                contactId,
            });
        }
        return tasks;
    }

    /** Сигнальные строки ОРК-истории по компании (done-даты + «Создан»). */
    async loadCompanySignalRows(
        companyId: number,
    ): Promise<SsCompanySignalRows> {
        const crmCamelId = this.resolver.camelId(EnumOrkFieldCode.crm);
        if (!crmCamelId || !this.list.bitrixId) {
            return { doneDates: [], created: [] };
        }
        const items = (await this.bitrix.listItem.all({
            IBLOCK_ID: this.list.bitrixId.toString(),
            // копия: listItem.all мутирует dto.filter (ID-курсор пагинации)
            filter: { [crmCamelId]: [`CO_${companyId}`] },
        })) as unknown as Record<string, unknown>[];

        const result: SsCompanySignalRows = { doneDates: [], created: [] };
        for (const element of items) {
            const type = this.scalar(element, EnumOrkFieldCode.ork_event_type);
            if (
                !this.isItem(
                    type,
                    EnumOrkFieldCode.ork_event_type,
                    EnumOrkEventType.et_ork_signal,
                )
            ) {
                continue;
            }
            const action = this.scalar(
                element,
                EnumOrkFieldCode.ork_event_action,
            );
            if (
                this.isItem(
                    action,
                    EnumOrkFieldCode.ork_event_action,
                    EnumOrkEventAction.ea_ork_done,
                )
            ) {
                const date = this.scalar(
                    element,
                    EnumOrkFieldCode.ork_event_date,
                );
                if (date) result.doneDates.push(date);
            } else if (
                this.isItem(
                    action,
                    EnumOrkFieldCode.ork_event_action,
                    EnumOrkEventAction.ea_ork_act_create,
                )
            ) {
                const contactRaw = this.scalar(
                    element,
                    EnumOrkFieldCode.ork_crm_contact,
                );
                const contactId = contactRaw
                    ? Number(String(contactRaw).replace(/^C_/, '')) || null
                    : null;
                const nameRaw = element['NAME'];
                result.created.push({
                    id: Number(element['ID'] ?? 0),
                    name: typeof nameRaw === 'string' ? nameRaw : '',
                    contactId,
                });
            }
        }
        return result;
    }

    /** Есть ли «Состоялся» в окне ±2 дня от закрытия задачи. */
    hasDoneForTask(task: SsScannedTask, rows: SsCompanySignalRows): boolean {
        return hasDoneInWindow(task.closedDate, rows.doneDates);
    }

    /** «Создан»-строка задачи: по совпадению NAME с заголовком. */
    matchCreatedRow(
        task: SsScannedTask,
        rows: SsCompanySignalRows,
    ): { id: number; contactId: number | null } | null {
        const exact = rows.created.find(row => row.name === task.title);
        if (exact) return exact;
        const partial = rows.created.find(
            row =>
                row.name.length > 10 &&
                (task.title.includes(row.name) ||
                    row.name.includes(task.title)),
        );
        return partial ?? null;
    }

    /** Последний коммент менеджера из задачи (приоритет — ответственный). */
    async loadManagerComment(
        taskId: number,
        responsibleId: number,
    ): Promise<string> {
        try {
            const envelope = (await this.bitrix.api.call(
                'task.commentitem.getlist',
                { TASKID: taskId },
            )) as { result?: TaskCommentRow[] };
            const comments = envelope?.result ?? [];
            if (!comments.length) return '';
            const byResponsible = [...comments]
                .reverse()
                .find(row => Number(row.AUTHOR_ID) === responsibleId);
            const chosen = byResponsible ?? comments[comments.length - 1];
            return String(chosen?.POST_MESSAGE ?? '');
        } catch (error) {
            this.logger.warn(
                `Комменты задачи ${taskId} не прочитаны: ${(error as Error).message}`,
            );
            return '';
        }
    }

    /** Дата будущего элемента для превью. */
    elementDate(task: SsScannedTask): string {
        return isoToCrmDateTime(task.closedDate);
    }

    private scalar(
        element: Record<string, unknown>,
        fieldCode: EnumOrkFieldCode,
    ): string | undefined {
        const camelId = this.resolver.camelId(fieldCode);
        if (!camelId) return undefined;
        const raw = element[camelId];
        if (typeof raw === 'object' && raw !== null) {
            const values = Object.values(raw as Record<string, unknown>);
            return values.length ? this.toScalar(values[0]) : undefined;
        }
        return this.toScalar(raw);
    }

    private toScalar(value: unknown): string | undefined {
        if (value === undefined || value === null) return undefined;
        if (typeof value === 'string') return value;
        if (typeof value === 'number') return String(value);
        return undefined;
    }

    private isItem(
        rawValue: string | undefined,
        fieldCode: EnumOrkFieldCode,
        itemCode: string,
    ): boolean {
        if (rawValue === undefined) return false;
        const bitrixId = this.resolver.itemBitrixId(fieldCode, itemCode);
        return bitrixId !== undefined && String(rawValue) === String(bitrixId);
    }
}
