import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { PBXService } from '@/modules/pbx';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    PbxZprSmartService,
    ZprSmartFieldCode,
    ZprSmartInfo,
} from '@lib/portal-lib/pbx/pbx-zpr-smart';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import {
    PbxSmartItemFieldsService,
    SmartItemFields,
} from '@lib/portal-lib/pbx/smart-item-fields';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import {
    applyQuestionnaireAnswers,
    buildMirrorItemsByKey,
    QuestionnaireAnswerPurpose,
} from '../shared/questionnaire-answers';
import { ZprFlowJobData } from './dto/zpr-flow-job.dto';
import { ZprFlowResult } from './constants/zpr-flow.const';

dayjs.extend(utc);
dayjs.extend(timezone);

const CRM_DATETIME_FORMAT = 'DD.MM.YYYY HH:mm:ss';
/** Лента комментариев элемента не растёт бесконечно. */
const COMMENTS_LIMIT = 50;

type BxRow = Record<string, unknown>;

/** Клиент Битрикса портала, инициализированный на время джоба. */
type FlowBitrix = Awaited<ReturnType<PBXService['init']>>['bitrix'];

/**
 * Всё, что нужно одному прогону джоба, одним объектом (зеркало
 * PresentationFlowRun): с приходом живых полей элемента позиционных
 * аргументов стало шесть, и порядок начал бы значить больше, чем смысл.
 */
interface ZprFlowRun {
    bitrix: FlowBitrix;
    portal: PortalModel;
    info: ZprSmartInfo;
    job: ZprFlowJobData;
    /** Таймзона портала — в ней живут все даты элемента. */
    tz: string;
    /** Текущий момент в формате элемента. */
    now: string;
    /**
     * ЖИВЫЕ поля элемента (`crm.item.fields`) — адреса портальной анкеты.
     * null — читать не понадобилось (ответов нет) либо не удалось.
     */
    itemFields: SmartItemFields | null;
}

/**
 * Сайд-flow ЗПР: элементы смарта «Звонки По решению» создаются/закрываются
 * ОТДЕЛЬНОЙ очередью после основного event-report (см. ZprFlowJobData).
 *
 * Self-gated: смарт не установлен на портале (resolveInfo → null) — джоб
 * молча завершён, основной flow ничего не заметил. История комментариев —
 * требование владельца: план-коммент при создании, отчёт-коммент при
 * закрытии, всё дублируется в накопительную ленту ZPR_COMMENTS.
 *
 * Связь с сущностями — поля элемента (['D_x'] / ['CO_x'] / ['L_x'] / ['C_x'],
 * формат как у СКАП-writer'а) + обратная ссылка op_zprs на базовой сделке
 * и компании значением `T{hex(entityTypeId)}_{id}` (динамическая привязка).
 */
@Injectable()
export class ZprFlowService {
    private readonly logger = new Logger(ZprFlowService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly zprSmart: PbxZprSmartService,
        private readonly smartItemFields: PbxSmartItemFieldsService,
    ) {}

    async handle(job: ZprFlowJobData): Promise<ZprFlowResult> {
        const info = await this.zprSmart.resolveInfo(job.domain);
        if (!info) {
            /*
             * Смарта нет — ответов портальной анкеты в этом джобе тоже не
             * может быть: вопрос без установленного смарта компиляция
             * каталога выбрасывает. Приехали вопреки — это ПОТЕРЯ ответов
             * менеджера, а не рядовой пропуск: debug в проде выключен, и
             * такая потеря была бы полностью беззвучной. Пустой джоб
             * остаётся на debug — портал без смарта штатно даёт его на
             * каждом отчёте.
             */
            const lost = job.answers?.length ?? 0;
            if (lost) {
                this.logger.warn(
                    `[zpr-flow] ${job.domain}: смарт zpr_sales не установлен — ` +
                        `${lost} ответ(ов) портальной анкеты записать некуда, ` +
                        'джоб пропущен',
                );
            } else {
                this.logger.debug(
                    `[zpr-flow] ${job.domain}: смарт zpr_sales не установлен — пропуск`,
                );
            }
            return { action: 'skipped', elementId: null };
        }

        const { bitrix, PortalModel: portal } = await this.pbx.init(job.domain);
        const tz = portal.getTimezone();
        const now = dayjs().tz(tz).format(CRM_DATETIME_FORMAT);

        // Дотяжка: базовую сделку мог создать ЭТОТ ЖЕ отчёт — на момент
        // постановки джоба числового id не было (в батче она `$result[...]`).
        // Джоб выполняется после батча, сделка уже существует — находим её
        // по компании и работаем как с обычной.
        const resolved: ZprFlowJobData = {
            ...job,
            baseDealId:
                job.baseDealId ??
                (await this.resolveBaseDealId(bitrix, portal, job)),
        };

        const run: ZprFlowRun = {
            bitrix,
            portal,
            info,
            job: resolved,
            tz,
            now,
            // Живые поля читаем ТОЛЬКО когда ответы есть: у подавляющего
            // большинства отчётов портальных анкет нет.
            itemFields: resolved.answers?.length
                ? await this.smartItemFields.resolveFields(
                      resolved.domain,
                      info.entityTypeId,
                  )
                : null,
        };

        const result =
            resolved.kind === 'plan'
                ? await this.createPlanned(run, ['plan'])
                : await this.closeReported(run);

        // Элемент ↔ задача (вопрос владельца 25.08): закрытая/перенесённая
        // задача получает привязку `T{hex}_{id}` в UF_CRM_TASK — сущности
        // смарта находятся из задачи штатным полем, без дотяжек.
        if (resolved.kind === 'report' && resolved.taskId && result.elementId) {
            await this.bindElementToTask(
                bitrix,
                resolved.taskId,
                info.entityTypeId,
                result.elementId,
            );
        }
        return result;
    }

    /** Привязка элемента к задаче — украшение, ошибки не роняют джоб. */
    private async bindElementToTask(
        bitrix: FlowBitrix,
        taskId: number,
        entityTypeId: number,
        elementId: number,
    ): Promise<void> {
        const ref = `T${entityTypeId.toString(16)}_${elementId}`;
        try {
            const response = (await bitrix.task.get(taskId, [
                'ID',
                'UF_CRM_TASK',
            ])) as {
                result?: {
                    task?: { ufCrmTask?: unknown; UF_CRM_TASK?: unknown };
                };
            } | null;
            const task = response?.result?.task;
            // tasks.* отдаёт camelCase (ufCrmTask), но терпим оба регистра.
            const raw = task?.ufCrmTask ?? task?.UF_CRM_TASK;
            const current = Array.isArray(raw) ? raw.map(String) : [];
            if (current.includes(ref)) return;
            await bitrix.task.update(taskId, {
                UF_CRM_TASK: [...current, ref],
            });
        } catch (error) {
            this.logger.warn(
                `[zpr-flow] привязка элемента ${ref} к задаче ${taskId} не записана: ${(error as Error).message}`,
            );
        }
    }

    /**
     * Свежая открытая сделка основной воронки по компании. Не нашли — не
     * страшно: элемент останется связан компанией/лидом, это честная
     * деградация, а не ошибка.
     *
     * Правило владельца (25.08): дотяжка не подхватывает ЧУЖИЕ открытые
     * сделки — только сделки ответственного этого отчёта (`responsibleId`
     * джоба), иначе элемент ЗПР привязывался бы к сделке другого менеджера.
     * `ASSIGNED_BY_ID` сравнивается ЧИСЛОМ (REST отдаёт строки). Своих нет —
     * та же честная деградация (связь компанией/лидом). `responsibleId`
     * пуст (легаси-джоб) — фильтр выключен: некого считать «своим».
     */
    private async resolveBaseDealId(
        bitrix: FlowBitrix,
        portal: PortalModel,
        job: ZprFlowJobData,
    ): Promise<number | null> {
        if (!job.companyId) return null;
        const category = portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        if (!category) return null;
        try {
            const response = await bitrix.deal.getList(
                {
                    CATEGORY_ID: String(category.bitrixId),
                    COMPANY_ID: String(job.companyId),
                    CLOSED: 'N',
                } as never,
                ['ID', 'ASSIGNED_BY_ID'],
            );
            const rows = (response?.result ?? []) as Array<{
                ID?: unknown;
                ASSIGNED_BY_ID?: unknown;
            }>;
            const own = job.responsibleId
                ? rows.filter(
                      row =>
                          Number(row?.ASSIGNED_BY_ID) ===
                          Number(job.responsibleId),
                  )
                : rows;
            const ids = own
                .map(row => Number(row?.ID))
                .filter(id => Number.isFinite(id) && id > 0);
            if (!ids.length) return null;
            const latest = Math.max(...ids);
            this.logger.log(
                `[zpr-flow] ${job.domain}: базовая сделка дотянута по компании ` +
                    `${job.companyId} → ${latest}`,
            );
            return latest;
        } catch (error) {
            this.logger.warn(
                `[zpr-flow] дотяжка сделки по компании ${job.companyId} не удалась: ${(error as Error).message}`,
            );
            return null;
        }
    }

    /**
     * План ЗПР → элемент в «Запланирован».
     *
     * `purposes` — чьи ответы анкеты кладём. Обычно только плановые, но
     * на ПЕРЕНОСЕ без открытого элемента этот элемент рождается ради
     * самого отчёта, и отчётные ответы едут в него же: другого
     * элемента у них не будет, а молча терять их нельзя.
     */
    private async createPlanned(
        run: ZprFlowRun,
        purposes: readonly QuestionnaireAnswerPurpose[],
    ): Promise<ZprFlowResult> {
        const { bitrix, portal, info, job, now } = run;
        const fields: BxRow = {
            title: `ЗПР: ${job.planName || job.planDeadline || now}`,
            stageId: info.stageIdByCode['zpr_plan'],
            assignedById: job.responsibleId,
        };
        this.setUf(fields, info, 'ZPR_PLAN_DATE', job.planDeadline);
        this.setUf(fields, info, 'ZPR_RESPONSIBLE', job.responsibleId);
        this.setUf(fields, info, 'ZPR_PLAN_COMMENT', job.planComment);
        this.setUf(
            fields,
            info,
            'ZPR_COMMENTS',
            job.planComment ? [`${now} План: ${job.planComment}`] : null,
        );
        this.setUf(fields, info, 'ZPR_NEXT_CALL_DATE', job.planDeadline);
        this.applyLinks(fields, info, job);
        this.applyParents(fields, job);
        // Ответы анкеты — последними: поля, которые заполняет сам поток,
        // к этому моменту уже стоят, и их не перезаписать.
        this.applyAnswers(fields, run, purposes);

        const response = await bitrix.item.add(
            String(info.entityTypeId),
            fields as never,
        );
        const elementId = this.itemIdOf(response);
        this.logger.log(
            `[zpr-flow] ${job.domain}: план → элемент ${elementId ?? '?'} ` +
                `(op=${job.operationId ?? '-'})`,
        );
        if (elementId) {
            await this.appendOpZprs(bitrix, portal, info, job, elementId);
        }
        return { action: 'created', elementId };
    }

    /**
     * Отчёт по ЗПР-задаче → закрыть открытый элемент; не нашли — создать
     * спонтанный сразу с исходом (как спонтанные презентации).
     */
    private async closeReported(run: ZprFlowRun): Promise<ZprFlowResult> {
        const { bitrix, portal, info, job, now } = run;
        const open = await this.findOpenElement(bitrix, info, job);

        // Перенос: элемент живёт дальше в «Ожидании», задача та же —
        // закрытие и новый элемент означали бы фантомный «не состоялся»
        // и дубль открытого. Открытого нет — честно создаём план заново.
        if (job.isMove) {
            if (!open) {
                // Элемент заводится ради ЭТОГО отчёта и сразу становится
                // новым планом — значит несёт обе анкеты: отчётные ответы
                // иначе исчезли бы, другого элемента у них нет.
                return this.createPlanned(run, ['plan', 'report']);
            }
            const fields: BxRow = {
                stageId: info.stageIdByCode['zpr_pending'],
            };
            this.setUf(fields, info, 'ZPR_PLAN_DATE', job.planDeadline);
            this.setUf(fields, info, 'ZPR_NEXT_CALL_DATE', job.planDeadline);
            const moveKey = info.ufKeyByCode['ZPR_MOVE_COUNT'];
            if (moveKey) {
                fields[moveKey] = (Number(open[moveKey]) || 0) + 1;
            }
            const commentsKey = info.ufKeyByCode['ZPR_COMMENTS'];
            const previous =
                commentsKey && Array.isArray(open[commentsKey])
                    ? (open[commentsKey] as unknown[]).map(String)
                    : [];
            this.setUf(
                fields,
                info,
                'ZPR_COMMENTS',
                [
                    `${now} Перенос: ${job.planName || ''} → ${job.planDeadline ?? '?'}`.trim(),
                    ...previous,
                ].slice(0, COMMENTS_LIMIT),
            );
            // Перенос — тоже отчёт менеджера: он рассказал, что выяснил,
            // а элемент остаётся открытым, и ответы в нём честны. Анкета
            // ПЛАНА — сюда же: план-джоба у переноса нет вовсе, новым
            // планом стал этот самый элемент.
            this.applyAnswers(fields, run, ['report', 'plan']);
            await bitrix.item.update(
                Number(open.id),
                String(info.entityTypeId) as never,
                fields as never,
            );
            this.logger.log(
                `[zpr-flow] ${job.domain}: перенос → элемент ${open.id} в ожидании`,
            );
            return { action: 'moved', elementId: Number(open.id) || null };
        }
        const targetStage = this.resolveClosingStage(info, job);
        const reportEntry = job.reportComment
            ? `${now} Отчёт: ${job.reportComment}`
            : `${now} Отчёт: ${job.isResult ? 'состоялся' : 'не состоялся'}`;

        if (open) {
            const commentsKey = info.ufKeyByCode['ZPR_COMMENTS'];
            const previous =
                commentsKey && Array.isArray(open[commentsKey])
                    ? (open[commentsKey] as unknown[]).map(String)
                    : [];
            const fields: BxRow = { stageId: targetStage };
            this.setUf(fields, info, 'ZPR_DONE_DATE', now);
            this.setUf(fields, info, 'ZPR_LAST_CALL_DATE', now);
            this.setUf(fields, info, 'ZPR_REPORT_COMMENT', job.reportComment);
            this.setUf(
                fields,
                info,
                'ZPR_COMMENTS',
                [reportEntry, ...previous].slice(0, COMMENTS_LIMIT),
            );
            this.applySurvey(fields, info, job);
            this.applyAnswers(fields, run, ['report']);
            await bitrix.item.update(
                Number(open.id),
                String(info.entityTypeId) as never,
                fields as never,
            );
            this.logger.log(
                `[zpr-flow] ${job.domain}: отчёт → элемент ${open.id} закрыт ` +
                    `(${job.isResult ? 'состоялся' : 'не состоялся'})`,
            );
            return { action: 'closed', elementId: Number(open.id) || null };
        }

        // Спонтанный ЗПР: плана не было — фиксируем факт сразу закрытым.
        const fields: BxRow = {
            title: `ЗПР (спонтанный): ${now}`,
            stageId: targetStage,
            assignedById: job.responsibleId,
        };
        this.setUf(fields, info, 'ZPR_IS_SPONTANEOUS', 'Y');
        this.setUf(fields, info, 'ZPR_DONE_DATE', now);
        this.setUf(fields, info, 'ZPR_LAST_CALL_DATE', now);
        this.setUf(fields, info, 'ZPR_RESPONSIBLE', job.responsibleId);
        this.setUf(fields, info, 'ZPR_REPORT_COMMENT', job.reportComment);
        this.setUf(fields, info, 'ZPR_COMMENTS', [reportEntry]);
        this.applyLinks(fields, info, job);
        this.applyParents(fields, job);
        this.applySurvey(fields, info, job);
        // Спонтанный ЗПР: элемента раньше не существовало, он рождается
        // прямо здесь и сразу с ответами анкеты.
        this.applyAnswers(fields, run, ['report']);

        const response = await bitrix.item.add(
            String(info.entityTypeId),
            fields as never,
        );
        const elementId = this.itemIdOf(response);
        this.logger.log(
            `[zpr-flow] ${job.domain}: спонтанный ЗПР → элемент ${elementId ?? '?'}`,
        );
        if (elementId) {
            await this.appendOpZprs(bitrix, portal, info, job, elementId);
        }
        return { action: 'spontaneous', elementId };
    }

    /**
     * Открытый элемент этого клиента: стадии план/ожидание, совпадение по
     * базовой сделке (или компании, когда сделки нет). Фильтр по стадиям —
     * серверный, матч по связи — в JS: фильтрация crm.item.list по значению
     * crm-поля ненадёжна, а открытых ЗПР у клиента единицы.
     */
    private async findOpenElement(
        bitrix: FlowBitrix,
        info: ZprSmartInfo,
        job: ZprFlowJobData,
    ): Promise<BxRow | null> {
        const openStages = [
            info.stageIdByCode['zpr_plan'],
            info.stageIdByCode['zpr_pending'],
        ].filter(Boolean);
        if (!openStages.length) return null;

        // listAll: у активного портала открытых ЗПР больше страницы crm.item
        // (50), одна страница теряла бы элемент клиента (находка ревью).
        const rows = (await bitrix.item.listAll(String(info.entityTypeId), {
            stageId: openStages,
        } as never)) as unknown as BxRow[];

        const baseKey = info.ufKeyByCode['ZPR_BASE_DEAL'];
        const companyKey = info.ufKeyByCode['ZPR_COMPANY'];
        const leadKey = info.ufKeyByCode['ZPR_LEAD'];
        const matches = rows.filter(row => {
            if (job.baseDealId && baseKey) {
                return this.hasLink(row[baseKey], 'D', job.baseDealId);
            }
            if (job.companyId && companyKey) {
                return this.hasLink(row[companyKey], 'CO', job.companyId);
            }
            // Лид-only клиент (заявка без компании и сделки) — элемент
            // связан только лидом, без этой ветки он не закрывался бы.
            if (job.leadId && leadKey) {
                return this.hasLink(row[leadKey], 'L', job.leadId);
            }
            return false;
        });
        if (!matches.length) return null;
        // Последний запланированный — самый свежий id.
        return matches.reduce((latest, row) =>
            Number(row.id) > Number(latest.id) ? row : latest,
        );
    }

    /** Обратная ссылка на элемент в op_zprs сделки и компании (append). */
    private async appendOpZprs(
        bitrix: FlowBitrix,
        portal: PortalModel,
        info: ZprSmartInfo,
        job: ZprFlowJobData,
        elementId: number,
    ): Promise<void> {
        // Динамическая привязка crm-поля: T{entityTypeId в hex}_{id}.
        const ref = `T${info.entityTypeId.toString(16)}_${elementId}`;

        const targets: Array<{
            entity: 'deal' | 'company';
            id: number | null;
            read: (id: number, select: string[]) => Promise<unknown>;
            update: (id: number, fields: BxRow) => Promise<unknown>;
        }> = [
            {
                entity: 'deal',
                id: job.baseDealId,
                read: (id, select) => bitrix.deal.get(id, select),
                update: (id, fields) => bitrix.deal.update(id, fields as never),
            },
            {
                entity: 'company',
                id: job.companyId,
                read: (id, select) => bitrix.company.get(id, select as never),
                update: (id, fields) =>
                    bitrix.company.update(id, fields as never),
            },
        ];

        for (const target of targets) {
            if (!target.id) continue;
            const field = portal.getEntityFieldByCode(
                target.entity,
                PBX_SALES_EVENT_FIELD_CODES.op_zprs,
            );
            if (!field) continue;
            const name = portal.getFieldBitrixId(field);
            try {
                const response = (await target.read(target.id, [
                    'ID',
                    name,
                ])) as { result?: BxRow } | BxRow | null;
                const row =
                    (response as { result?: BxRow })?.result ??
                    (response as BxRow | null);
                const raw = row?.[name];
                const current = Array.isArray(raw) ? raw.map(String) : [];
                if (current.includes(ref)) continue;
                await target.update(target.id, {
                    [name]: [...current, ref],
                });
            } catch (error) {
                // Обратная ссылка — удобство, не инвариант: элемент и так
                // находится по своим crm-полям.
                this.logger.warn(
                    `[zpr-flow] op_zprs на ${target.entity} ${target.id} не записан: ${(error as Error).message}`,
                );
            }
        }
    }

    /**
     * Стадия закрытия звонка (правило владельца 26.08):
     *  - не дозвонились → «Не состоялся»;
     *  - дозвонились, и клиент отказал этим же отчётом → «Состоялся: отказ»
     *    (дозвон состоялся — это не то же самое, что недозвон);
     *  - дозвонились, работа продолжается → «Состоялся: в работе».
     * Что случится со сделкой дальше (продажа, отказ, «не ЦА») читается по
     * самой сделке — элемент привязан к ней родителем.
     *
     * Стадии «Состоялся: отказ» может не быть на портале со СТАРОЙ
     * установкой смарта — тогда честный фолбэк на «Состоялся», а не
     * запись в несуществующую стадию.
     */
    private resolveClosingStage(
        info: ZprSmartInfo,
        job: ZprFlowJobData,
    ): string {
        if (!job.isResult) return info.stageIdByCode['zpr_noresult'];
        if (job.isFail) {
            return (
                info.stageIdByCode['zpr_result_fail'] ??
                info.stageIdByCode['zpr_success']
            );
        }
        return info.stageIdByCode['zpr_success'];
    }

    /**
     * РОДИТЕЛИ элемента — системные поля `parentId{entityTypeId}`.
     *
     * Наши crm-поля (ZPR_BASE_DEAL и прочие) хранят связь для нашего же
     * кода, но Битрикс показывает дочерние элементы в карточке и фильтрует
     * их ТОЛЬКО по системному родителю. Без него вкладка ЗПР в сделке
     * оставалась бы пустой, а отчёт «все звонки по решению этой сделки»
     * не собирался бы штатными средствами (замечание владельца 26.08).
     */
    private applyParents(fields: BxRow, job: ZprFlowJobData): void {
        if (job.baseDealId) fields['parentId2'] = job.baseDealId;
        if (job.companyId) fields['parentId4'] = job.companyId;
        if (job.leadId) fields['parentId1'] = job.leadId;
        if (job.contactId) fields['parentId3'] = job.contactId;
    }
    private applyLinks(
        fields: BxRow,
        info: ZprSmartInfo,
        job: ZprFlowJobData,
    ): void {
        if (job.baseDealId) {
            this.setUf(fields, info, 'ZPR_BASE_DEAL', [`D_${job.baseDealId}`]);
        }
        if (job.presDealId) {
            this.setUf(fields, info, 'ZPR_PRES_DEAL', [`D_${job.presDealId}`]);
        }
        if (job.companyId) {
            this.setUf(fields, info, 'ZPR_COMPANY', [`CO_${job.companyId}`]);
        }
        if (job.leadId) {
            this.setUf(fields, info, 'ZPR_LEAD', [`L_${job.leadId}`]);
        }
        if (job.contactId) {
            this.setUf(fields, info, 'ZPR_CONTACT', [`C_${job.contactId}`]);
        }
    }

    /**
     * Снимок анкеты по кодам НАШЕГО реестра полей — зеркало
     * PresentationFlowService.applySurvey.
     *
     * Пишется только в закрывающих ветках (закрытие и спонтанный), как у
     * презентаций: на переносе звонок ещё не состоялся, снимка нет.
     * Состав снимка сегодня никто не собирает (см. ZprSurveySnapshot) —
     * поток готов принять его, как только владелец назовёт состав.
     */
    private applySurvey(
        fields: BxRow,
        info: ZprSmartInfo,
        job: ZprFlowJobData,
    ): void {
        for (const [code, value] of Object.entries(job.survey ?? {})) {
            this.setUf(fields, info, code as ZprSmartFieldCode, value);
        }
    }

    /**
     * Ответы ПОРТАЛЬНОЙ анкеты в элемент — зеркало
     * PresentationFlowService.applyAnswers (см. комментарий там).
     */
    private applyAnswers(
        fields: BxRow,
        run: ZprFlowRun,
        purposes: readonly QuestionnaireAnswerPurpose[],
    ): void {
        const answers = run.job.answers ?? [];
        if (!answers.length) return;

        if (!run.itemFields) {
            this.logger.warn(
                `[zpr-flow] ${run.job.domain}: поля элемента не прочитаны — ` +
                    `${answers.length} ответ(ов) анкеты не записаны`,
            );
            return;
        }

        const { applied, warnings } = applyQuestionnaireAnswers({
            fields,
            itemFields: run.itemFields,
            answers,
            purposes,
            timezone: run.tz,
            mirrorItemsByKey: buildMirrorItemsByKey(run.info),
        });
        for (const warning of warnings) {
            this.logger.warn(`[zpr-flow] ${run.job.domain}: ${warning}`);
        }
        if (applied) {
            this.logger.log(
                `[zpr-flow] ${run.job.domain}: ответов анкеты в элемент ` +
                    `(${purposes.join('+')}) — ${applied}`,
            );
        }
    }

    /** Значение по фактическому camel-ключу поля; пусто — пропуск. */
    private setUf(
        fields: BxRow,
        info: ZprSmartInfo,
        code: ZprSmartFieldCode,
        value: unknown,
    ): void {
        if (value === null || value === undefined || value === '') return;
        if (Array.isArray(value) && !value.length) return;
        const key = info.ufKeyByCode[code];
        if (!key) return;
        fields[key] = value;
    }

    /**
     * Совпадение значения crm-поля с сущностью. Толерантно к ОБОИМ форматам
     * хранения: `D_100` (мультитипная привязка) и голый `100` (Битрикс может
     * нормализовать одиночно-типизированное поле до id) — канон
     * lead-request-sync доказал, что формат зависит от привязок поля.
     */
    private hasLink(
        raw: unknown,
        prefix: string,
        id: number | string,
    ): boolean {
        const expected = new Set([`${prefix}_${id}`, String(id)]);
        const values = Array.isArray(raw) ? raw : [raw];
        return values.some(value => expected.has(String(value ?? '')));
    }

    private itemIdOf(response: unknown): number | null {
        const item = (response as { result?: { item?: { id?: unknown } } })
            ?.result?.item;
        const id = Number(item?.id);
        return Number.isFinite(id) && id > 0 ? id : null;
    }
}
