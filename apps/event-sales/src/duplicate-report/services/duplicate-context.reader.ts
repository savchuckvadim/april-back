import { Logger } from '@nestjs/common';
import {
    BitrixService,
    IBXCompany,
    IBXContact,
    IBXLead,
} from '@/modules/bitrix';
import { EBXTaskStatus } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { taskCrmBinding } from '@/modules/bitrix/domain/tasks/task/lib/task-crm-binding.util';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';
import { InnFieldMap } from '@lib/portal-lib/pbx-inn/lib/inn-fields';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { findBatchResult } from '../../shared/bitrix/prepare-batch-results.util';
import { BX_SOURCE_STATUS_ENTITY } from '../constants/duplicate-report.const';
import {
    BxRow,
    clientCaptions,
    openTasksOf,
    rowsOf,
    sourceNameMap,
    toDuplicateLead,
} from '../lib/duplicate-context.mapper';
import {
    DuplicateContext,
    DuplicateGroup,
    DuplicateLead,
    DuplicateOpenTask,
} from '../types/duplicate-report.types';

type ListEntity = 'company' | 'contact' | 'lead';

/** ID в одной list-команде: Битрикс отдаёт не больше 50 строк. */
const IDS_PER_COMMAND = 50;

const chunks = <T>(items: readonly T[], size: number): T[][] => {
    const result: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        result.push(items.slice(i, i + size));
    }
    return result;
};

const unique = (ids: readonly (number | null)[]): number[] => [
    ...new Set(ids.filter((id): id is number => id !== null)),
];

const taskCommand = (dealId: number): string => `dr_tasks_${dealId}`;

/**
 * Второй проход отчёта: подписи клиентов, ИНН компаний, лиды-источники,
 * открытые задачи сделок. Все команды независимы (без `$result[...]`) и
 * идут ОДНОЙ очередью batch, которую транспорт режет по 50
 * (ai/rules/bitrix-batch-grouping.md, §7). Задачи — по команде на сделку
 * с привязкой `D_<id>`: нужны задачи пары сотен сделок, а не вся задачная
 * база портала.
 *
 * НЕ `@Injectable`: инстанс Битрикса приходит параметром (CLAUDE.md).
 * Сбой чтения не роняет отчёт — он попадает в warnings.
 */
export class DuplicateContextReader {
    private readonly logger = new Logger(DuplicateContextReader.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    async load(
        groups: readonly DuplicateGroup[],
        warnings: string[],
    ): Promise<DuplicateContext> {
        const deals = groups.flatMap(group => group.deals);
        const ofKind = (kind: 'company' | 'contact'): number[] =>
            unique(
                groups
                    .filter(group => group.client.kind === kind)
                    .map(group => group.client.id),
            );
        const companyInn = InnFieldMap.from(this.portal).inn('company');
        const siteField = this.leadField(
            PBX_SALES_EVENT_FIELD_CODES.op_lead_site_status,
        );

        const keys: Record<ListEntity, string[]> = {
            company: this.enqueueByIds('company', ofKind('company'), [
                'ID',
                'TITLE',
                ...(companyInn ? [companyInn] : []),
            ]),
            contact: this.enqueueByIds('contact', ofKind('contact'), [
                'ID',
                'NAME',
                'LAST_NAME',
                'SECOND_NAME',
            ]),
            lead: this.enqueueByIds(
                'lead',
                unique(deals.map(deal => deal.sourceLeadId)),
                [
                    'ID',
                    'TITLE',
                    'DATE_CREATE',
                    'SOURCE_ID',
                    ...(siteField ? [siteField] : []),
                ],
            ),
        };
        for (const deal of deals) {
            this.bitrix.batch.task.getList(
                taskCommand(deal.id),
                {
                    UF_CRM_TASK: [taskCrmBinding('DEAL', deal.id)],
                    '!STATUS': EBXTaskStatus.COMPLETED,
                },
                // Ответственный задачи: работа считается только своя.
                ['ID', 'STATUS', 'RESPONSIBLE_ID'],
            );
        }

        /*
         * strict: упал целый чанк — прогон падает и повторится в следующий
         * тик. Тихо неполные задачи исказили бы «кто ведёт» и основную
         * сделку, а отчёт выглядел бы полным.
         */
        const responses = await this.bitrix.api.callBatchWithConcurrency(1, {
            strict: true,
        });
        let missing = 0;
        const result = (key: string): unknown => {
            const raw = findBatchResult<unknown>(responses, key);
            if (raw === undefined) missing += 1;
            return raw;
        };
        const read = (entity: ListEntity): BxRow[] =>
            keys[entity].flatMap(key => rowsOf(result(key)));

        const captions = clientCaptions(
            read('company'),
            read('contact'),
            companyInn,
        );
        const sources = await this.sourceNames();
        const leads = new Map<number, DuplicateLead>();
        for (const row of read('lead')) {
            const lead = toDuplicateLead(
                row,
                sources,
                siteField,
                this.portal.getTimezone(),
            );
            if (lead) leads.set(lead.id, lead);
        }
        const openTasks = new Map<number, DuplicateOpenTask[]>();
        for (const deal of deals) {
            const raw = result(taskCommand(deal.id));
            if (raw !== undefined) openTasks.set(deal.id, openTasksOf(raw));
        }

        if (missing) {
            warnings.push(
                `часть данных Битрикс не вернул (команд: ${missing}) — ` +
                    'названия, лиды или задачи у части клиентов могут быть пустыми',
            );
        }
        return {
            clientTitles: captions.titles,
            clientInns: captions.inns,
            leads,
            openTasks,
        };
    }

    /** Команды `crm.*.list` по ID пачками по 50; возвращает их ключи. */
    private enqueueByIds(
        entity: ListEntity,
        ids: readonly number[],
        select: string[],
    ): string[] {
        return chunks(ids, IDS_PER_COMMAND).map((part, index) => {
            const key = `dr_${entity}_${index}`;
            const filter = { ID: part };
            if (entity === 'company') {
                this.bitrix.batch.company.getList(
                    key,
                    filter as unknown as Partial<IBXCompany>,
                    select,
                );
            } else if (entity === 'contact') {
                this.bitrix.batch.contact.getList(
                    key,
                    filter as unknown as Partial<IBXContact>,
                    select,
                );
            } else {
                this.bitrix.batch.lead.getList(
                    key,
                    filter as unknown as Partial<IBXLead>,
                    select,
                );
            }
            return key;
        });
    }

    /**
     * Справочник источников: код → название («Заявка с веб-сайта», «База
     * Актион …»). Сбой — пустые подписи: на разбор он не влияет.
     */
    private async sourceNames(): Promise<Map<string, string>> {
        try {
            const response = await this.bitrix.status.getList({
                ENTITY_ID: BX_SOURCE_STATUS_ENTITY,
            });
            return sourceNameMap(rowsOf(response?.result));
        } catch (error) {
            this.logger.warn(
                `источники лидов не прочитаны: ${(error as Error).message}`,
            );
            return new Map();
        }
    }

    private leadField(code: string): string | null {
        const field = this.portal.getEntityFieldByCode('lead', code);
        return field ? this.portal.getFieldBitrixId(field) : null;
    }
}
