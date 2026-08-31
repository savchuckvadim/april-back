import { Logger } from '@nestjs/common';
import { ZprSmartInfo } from '@lib/portal-lib/pbx/pbx-zpr-smart';
import {
    hasCrmLink,
    parseSmartElementIdsFromTaskBindings,
} from '@lib/portal-lib/pbx/const-smart-registry';
import { FlowBitrix } from '../../shared/side-flow';
import { ZprFlowJobData } from '../dto/zpr-flow-job.dto';
import { BxRow } from '../types/zpr-flow-run.type';
import { zprUfKey } from './zpr-element-fields.builder';
import { zprOpenStageIds } from './zpr-stage.resolver';

/**
 * Поиск ОТКРЫТОГО элемента ЗПР — единственная операция чтения потока, и
 * вынесена она отдельно ровно поэтому: правило «какой элемент считается
 * тем самым» продуктовое и меняется само по себе, независимо от того, что
 * writer с найденным элементом делает.
 *
 * `bitrix` приходит в конструктор (класс создаётся на прогон джоба, а не
 * инжектится): инстанс привязан к домену портала — правило CLAUDE.md.
 */
export class ZprElementLookupService {
    private readonly logger = new Logger(ZprElementLookupService.name);

    constructor(private readonly bitrix: FlowBitrix) {}

    /**
     * Открытый элемент, ПО КОТОРОМУ отчитываются.
     *
     * Порядок источников:
     *  1. ПРИВЯЗКА ЗАДАЧИ (`UF_CRM_TASK` → `T{hex}_{id}`) — точный указатель.
     *     Отчёт идёт по конкретной задаче, а задача знает свой элемент:
     *     наш же биндер записал его при создании плана. Клиентская
     *     эвристика тут в принципе не может быть верной — звонков клиенту
     *     может быть запланировано несколько одновременно, и «самый свежий
     *     открытый» закрывает чужой (инцидент владельца 31.08: вместо
     *     элемента из задачи создался спонтанный дубль).
     *     Задача назвала элементы этого смарта — её слово ФИНАЛЬНО: среди
     *     названных нет открытого (уже закрыт/отменён) — честный null и
     *     спонтанная фиксация факта звонка, БЕЗ отката на эвристику:
     *     эвристика в этом случае закрыла бы чужой открытый план.
     *  2. Эвристика по клиенту — только когда задача элементов этого
     *     смарта не называет: легаси-задачи до появления привязки, джобы
     *     старой формы без `taskCrmBindings`.
     */
    async findOpenElement(
        info: ZprSmartInfo,
        job: ZprFlowJobData,
    ): Promise<BxRow | null> {
        const openStages = zprOpenStageIds(info);
        if (!openStages.length) return null;

        const taskElementIds = parseSmartElementIdsFromTaskBindings(
            job.taskCrmBindings,
            info.entityTypeId,
        );
        if (taskElementIds.length) {
            try {
                return await this.findOpenByIds(
                    info,
                    taskElementIds,
                    openStages,
                );
            } catch (error) {
                // Сеть/права: указатель есть, но проверить его не вышло.
                // Падать в клиентскую эвристику нельзя — она закрывает не
                // тот элемент; фиксируем и идём веткой «открытого нет».
                this.logger.warn(
                    `[zpr-flow] ${job.domain}: элемент из привязки задачи ` +
                        `(${taskElementIds.join(', ')}) не прочитан: ` +
                        `${(error as Error).message}`,
                );
                return null;
            }
        }

        return this.findOpenByClient(info, job, openStages);
    }

    /**
     * Открытый элемент из НАЗВАННЫХ задачей id. Обычно id один; несколько —
     * задача успела пройти не один цикл план→перенос, берём самый свежий
     * из открытых.
     */
    private async findOpenByIds(
        info: ZprSmartInfo,
        ids: number[],
        openStages: string[],
    ): Promise<BxRow | null> {
        const open: BxRow[] = [];
        for (const id of ids) {
            const response = (await this.bitrix.item.get(
                id,
                String(info.entityTypeId),
            )) as { result?: { item?: BxRow } } | null;
            const item = response?.result?.item;
            if (!item) continue;
            const stage = typeof item.stageId === 'string' ? item.stageId : '';
            if (openStages.includes(stage)) {
                open.push(item);
            }
        }
        if (!open.length) return null;
        return open.reduce((latest, row) =>
            Number(row.id) > Number(latest.id) ? row : latest,
        );
    }

    /**
     * Эвристика по клиенту: открытые стадии + совпадение ЛЮБОЙ из связей.
     *
     * Именно ЛЮБОЙ: раньше проверка обрывалась на первой ЗАДАННОЙ в джобе
     * связи (`baseDealId` есть → смотрим только сделку), и элемент,
     * созданный без привязки к сделке (она в тот момент была `$result[...]`
     * того же батча), не находился по компании/лиду — отчёт заводил
     * спонтанный дубль.
     *
     * Фильтр по стадиям — серверный, матч по связи — в JS: фильтрация
     * crm.item.list по значению crm-поля ненадёжна, а открытых ЗПР у
     * клиента единицы.
     */
    private async findOpenByClient(
        info: ZprSmartInfo,
        job: ZprFlowJobData,
        openStages: string[],
    ): Promise<BxRow | null> {
        // listAll: у активного портала открытых ЗПР больше страницы crm.item
        // (50), одна страница теряла бы элемент клиента (находка ревью).
        const rows = (await this.bitrix.item.listAll(
            String(info.entityTypeId),
            {
                stageId: openStages,
            } as never,
        )) as unknown as BxRow[];

        const baseKey = zprUfKey(info, 'ZPR_BASE_DEAL');
        const companyKey = zprUfKey(info, 'ZPR_COMPANY');
        const leadKey = zprUfKey(info, 'ZPR_LEAD');
        const matches = rows.filter(
            row =>
                Boolean(
                    job.baseDealId &&
                        baseKey &&
                        hasCrmLink(row[baseKey], 'D', job.baseDealId),
                ) ||
                Boolean(
                    job.companyId &&
                        companyKey &&
                        hasCrmLink(row[companyKey], 'CO', job.companyId),
                ) ||
                // Лид-only клиент (заявка без компании и сделки) — элемент
                // связан только лидом, без этой ветки он не закрывался бы.
                Boolean(
                    job.leadId &&
                        leadKey &&
                        hasCrmLink(row[leadKey], 'L', job.leadId),
                ),
        );
        if (!matches.length) return null;
        // Последний запланированный — самый свежий id.
        return matches.reduce((latest, row) =>
            Number(row.id) > Number(latest.id) ? row : latest,
        );
    }
}
