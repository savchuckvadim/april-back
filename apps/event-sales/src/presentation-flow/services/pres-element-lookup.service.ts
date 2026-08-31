import { Logger } from '@nestjs/common';
import { PresentationSmartInfo } from '@lib/portal-lib/pbx/pbx-presentation-smart';
import {
    hasCrmLink,
    parseSmartElementIdsFromTaskBindings,
} from '@lib/portal-lib/pbx/const-smart-registry';
import { FlowBitrix } from '../../shared/side-flow';
import { PresentationFlowJobData } from '../dto/presentation-flow-job.dto';
import { BxRow } from '../types/presentation-flow-run.type';
import { presUfKey } from './pres-element-fields.builder';
import { presOpenStageIds } from './pres-stage.resolver';

/**
 * Поиск ОТКРЫТОГО элемента презентации — единственная операция чтения
 * потока (зеркало zpr-element-lookup): правило «какой элемент считается
 * тем самым» продуктовое и меняется само по себе, независимо от того,
 * что writer с найденным элементом делает.
 *
 * `bitrix` приходит в конструктор (класс создаётся на прогон джоба, а не
 * инжектится): инстанс привязан к домену портала — правило CLAUDE.md.
 */
export class PresElementLookupService {
    private readonly logger = new Logger(PresElementLookupService.name);

    constructor(private readonly bitrix: FlowBitrix) {}

    /**
     * Открытый элемент, ПО КОТОРОМУ отчитываются.
     *
     * Порядок источников:
     *  1. ПРИВЯЗКА ЗАДАЧИ (`UF_CRM_TASK` → `T{hex}_{id}`) — точный
     *     указатель: отчёт идёт по конкретной задаче, а задача знает свой
     *     элемент (его записал наш же биндер). Презентаций у клиента может
     *     быть запланировано несколько, и «самый свежий открытый» закрывал
     *     бы чужую (инцидент владельца 31.08 на ЗПР). Задача назвала
     *     элементы этого смарта — её слово ФИНАЛЬНО: открытого среди них
     *     нет — честный null без отката на клиентскую эвристику.
     *  2. Эвристика по клиенту — только когда задача элементов этого
     *     смарта не называет (легаси-задачи, джобы старой формы).
     */
    async findOpenElement(
        info: PresentationSmartInfo,
        job: PresentationFlowJobData,
    ): Promise<BxRow | null> {
        const openStages = presOpenStageIds(info);
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
                    `[presentation-flow] ${job.domain}: элемент из привязки ` +
                        `задачи (${taskElementIds.join(', ')}) не прочитан: ` +
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
        info: PresentationSmartInfo,
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
     * созданный без привязки к сделке (она была `$result[...]` того же
     * батча), не находился по компании/лиду — отчёт заводил спонтанный
     * дубль. hasCrmLink терпит оба поколения формата (`D_100` и голый id).
     *
     * ОБЯЗАТЕЛЬНО listAll, а не list: crm.item.list отдаёт максимум 50
     * элементов за страницу, а открытых презентаций на активном портале
     * больше — элемент клиента не попадал в первую страницу, отчёт его «не
     * находил» и плодил спонтанные дубли. listAll листает курсором по id
     * все страницы (внутренний order id ASC — часть курсора, менять
     * нельзя), поэтому «самый свежий» выбирается уже по полной выборке.
     * select сужает payload до ключей, нужных матчу и последующему update
     * (лента, счётчик).
     */
    private async findOpenByClient(
        info: PresentationSmartInfo,
        job: PresentationFlowJobData,
        openStages: string[],
    ): Promise<BxRow | null> {
        const baseKey = presUfKey(info, 'PRES_BASE_DEAL');
        const companyKey = presUfKey(info, 'PRES_COMPANY');
        const leadKey = presUfKey(info, 'PRES_LEAD');
        const select = [
            'id',
            baseKey,
            companyKey,
            leadKey,
            presUfKey(info, 'PRES_COMMENTS'),
            presUfKey(info, 'PRES_MOVE_COUNT'),
        ].filter((key): key is string => !!key);

        const rows = (await this.bitrix.item.listAll(
            String(info.entityTypeId),
            { stageId: openStages } as never,
            select,
        )) as unknown as BxRow[];

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
                // Лид-only клиент (заявка без компании и сделки): элемент
                // при создании связан только лидом — без этой ветки он не
                // находился и каждый отчёт заводил новый элемент.
                Boolean(
                    job.leadId &&
                        leadKey &&
                        hasCrmLink(row[leadKey], 'L', job.leadId),
                ),
        );
        if (!matches.length) return null;
        // Последняя запланированная — самый свежий id.
        return matches.reduce((latest, row) =>
            Number(row.id) > Number(latest.id) ? row : latest,
        );
    }
}
