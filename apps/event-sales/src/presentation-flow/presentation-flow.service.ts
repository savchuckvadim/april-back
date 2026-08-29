import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { PBXService } from '@/modules/pbx';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    PbxPresentationSmartService,
    PRESENTATION_OPEN_STAGE_CODES,
    presentationFailReasonItemCode,
    PresentationSmartFieldCode,
    PresentationSmartInfo,
} from '@lib/portal-lib/pbx/pbx-presentation-smart';
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
import { PresentationFlowJobData } from './dto/presentation-flow-job.dto';
import { PresentationFlowResult } from './constants/presentation-flow.const';
import {
    isPresentationMoveOutcome,
    PRESENTATION_OUTCOME,
    presentationResultCode,
    presentationStageForOutcome,
} from './lib/presentation-outcome';

dayjs.extend(utc);
dayjs.extend(timezone);

const CRM_DATETIME_FORMAT = 'DD.MM.YYYY HH:mm:ss';
/** Лента комментариев элемента не растёт бесконечно. */
const COMMENTS_LIMIT = 50;

type BxRow = Record<string, unknown>;

/** Клиент Битрикса портала, инициализированный на время джоба. */
type FlowBitrix = Awaited<ReturnType<PBXService['init']>>['bitrix'];

/**
 * Всё, что нужно одному прогону джоба, одним объектом.
 *
 * Раньше эти пятеро ездили позиционными аргументами; с приходом живых
 * полей элемента (ответы портальной анкеты) их стало шесть, и порядок
 * начал бы значить больше, чем смысл.
 */
interface PresentationFlowRun {
    bitrix: FlowBitrix;
    portal: PortalModel;
    info: PresentationSmartInfo;
    job: PresentationFlowJobData;
    /** Таймзона портала — в ней живут все даты элемента. */
    tz: string;
    /** Текущий момент в формате элемента. */
    now: string;
    /**
     * ЖИВЫЕ поля элемента (`crm.item.fields`) — адреса портальной анкеты.
     * null — читать не понадобилось (ответов нет) либо не удалось: тогда
     * ответы просто не пишутся, всё остальное работает как прежде.
     */
    itemFields: SmartItemFields | null;
}

/**
 * Сайд-flow презентаций: элементы смарта «Презентации» создаются/закрываются
 * ОТДЕЛЬНОЙ очередью после основного event-report (см.
 * PresentationFlowJobData). Полное зеркало ZprFlowService — сознательно.
 *
 * Self-gated: смарт не установлен на портале (resolveInfo → null) — джоб
 * молча завершён, основной flow ничего не заметил, презентация продолжает
 * жить сделкой воронки «ОП Презентации» (её этот сервис не трогает вообще).
 *
 * Что умеет элемент, чего не умеет сделка: своя история комментариев,
 * СВОЙ снимок анкеты «5К»/«Хвост» на каждую презентацию, раздельные
 * «назначил»/«провёл», счётчик переносов.
 *
 * Связь с сущностями — поля элемента (['D_x'] / ['CO_x'] / ['L_x'] / ['C_x'],
 * формат как у СКАП-writer'а) + обратная ссылка op_presentations на базовой
 * сделке и компании значением `T{hex(entityTypeId)}_{id}`.
 */
@Injectable()
export class PresentationFlowService {
    private readonly logger = new Logger(PresentationFlowService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly presentationSmart: PbxPresentationSmartService,
        private readonly smartItemFields: PbxSmartItemFieldsService,
    ) {}

    async handle(
        job: PresentationFlowJobData,
    ): Promise<PresentationFlowResult> {
        const info = await this.presentationSmart.resolveInfo(job.domain);
        if (!info) {
            /*
             * Смарта нет — ответов портальной анкеты в этом джобе тоже не
             * может быть: вопрос без установленного смарта компиляция
             * каталога выбрасывает, и до фрейма он не доезжает. Приехали
             * вопреки — это ПОТЕРЯ ответов менеджера, а не рядовой
             * пропуск: debug в проде выключен, и такая потеря была бы
             * полностью беззвучной. Пустой джоб остаётся на debug —
             * портал без смарта штатно даёт его на каждом отчёте.
             */
            const lost = job.answers?.length ?? 0;
            if (lost) {
                this.logger.warn(
                    `[presentation-flow] ${job.domain}: смарт pres_sales не ` +
                        `установлен — ${lost} ответ(ов) портальной анкеты ` +
                        'записать некуда, джоб пропущен',
                );
            } else {
                this.logger.debug(
                    `[presentation-flow] ${job.domain}: смарт pres_sales не установлен — пропуск`,
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
        const resolved: PresentationFlowJobData = {
            ...job,
            baseDealId:
                job.baseDealId ??
                (await this.resolveBaseDealId(bitrix, portal, job)),
        };

        const run: PresentationFlowRun = {
            bitrix,
            portal,
            info,
            job: resolved,
            tz,
            now,
            // Живые поля читаем ТОЛЬКО когда ответы есть: у подавляющего
            // большинства отчётов портальных анкет нет, и лишний вызов
            // Битрикса им ни к чему.
            itemFields: resolved.answers?.length
                ? await this.smartItemFields.resolveFields(
                      resolved.domain,
                      info.entityTypeId,
                  )
                : null,
        };

        const result =
            resolved.kind === 'plan'
                ? await this.createPlanned(run)
                : await this.closeReported(run);

        // Элемент ↔ задача (зеркало zpr-flow): закрытая/перенесённая задача
        // получает привязку `T{hex}_{id}` в UF_CRM_TASK.
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
            const raw = task?.ufCrmTask ?? task?.UF_CRM_TASK;
            const current = Array.isArray(raw) ? raw.map(String) : [];
            if (current.includes(ref)) return;
            await bitrix.task.update(taskId, {
                UF_CRM_TASK: [...current, ref],
            });
        } catch (error) {
            this.logger.warn(
                `[presentation-flow] привязка элемента ${ref} к задаче ${taskId} не записана: ${(error as Error).message}`,
            );
        }
    }

    /**
     * Свежая открытая сделка основной воронки по компании. Не нашли — не
     * страшно: элемент останется связан компанией/лидом, это честная
     * деградация, а не ошибка.
     *
     * Правило владельца (25.08), зеркально zpr-flow: чужие открытые сделки
     * дотяжка не подхватывает — только сделки ответственного этого отчёта;
     * ASSIGNED_BY_ID сравнивается ЧИСЛОМ (REST отдаёт строки); пустой
     * responsibleId (легаси-джоб) выключает фильтр.
     */
    private async resolveBaseDealId(
        bitrix: FlowBitrix,
        portal: PortalModel,
        job: PresentationFlowJobData,
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
                `[presentation-flow] ${job.domain}: базовая сделка дотянута по ` +
                    `компании ${job.companyId} → ${latest}`,
            );
            return latest;
        } catch (error) {
            this.logger.warn(
                `[presentation-flow] дотяжка сделки по компании ${job.companyId} не удалась: ${(error as Error).message}`,
            );
            return null;
        }
    }

    /** План презентации → элемент в «Запланирована». */
    private async createPlanned(
        run: PresentationFlowRun,
    ): Promise<PresentationFlowResult> {
        const { bitrix, portal, info, job, now } = run;
        const fields: BxRow = {
            title: `Презентация: ${job.planName || job.planDeadline || now}`,
            stageId: info.stageIdByCode['pres_plan'],
            assignedById: job.responsibleId,
        };
        this.setUf(fields, info, 'PRES_PLAN_DATE', job.planDeadline);
        this.setUf(fields, info, 'PRES_RESPONSIBLE', job.responsibleId);
        this.setUf(
            fields,
            info,
            'PRES_PLAN_RESPONSIBLE',
            job.planResponsibleId,
        );
        this.setUf(fields, info, 'PRES_PLAN_COMMENT', job.planComment);
        this.setUf(
            fields,
            info,
            'PRES_COMMENTS',
            job.planComment ? [`${now} План: ${job.planComment}`] : null,
        );
        this.setUf(fields, info, 'PRES_NEXT_CALL_DATE', job.planDeadline);
        this.applyLinks(fields, info, job);
        this.applyParents(fields, job);
        // Ответы анкеты ПЛАНА — последними: поля, которые заполняет сам
        // поток, к этому моменту уже стоят, и их не перезаписать.
        this.applyAnswers(fields, run, ['plan']);

        const response = await bitrix.item.add(
            String(info.entityTypeId),
            fields as never,
        );
        const elementId = this.itemIdOf(response);
        this.logger.log(
            `[presentation-flow] ${job.domain}: план → элемент ${elementId ?? '?'} ` +
                `(op=${job.operationId ?? '-'})`,
        );
        if (elementId) {
            await this.appendOpPresentations(
                bitrix,
                portal,
                info,
                job,
                elementId,
            );
        }
        return { action: 'created', elementId };
    }

    /**
     * Отчёт по презентации → закрыть (или перенести) открытый элемент; плана
     * не было — создать спонтанный сразу с исходом.
     */
    private async closeReported(
        run: PresentationFlowRun,
    ): Promise<PresentationFlowResult> {
        const { bitrix, portal, info, job, now } = run;
        const outcome = job.outcome ?? PRESENTATION_OUTCOME.done;
        const isMove = isPresentationMoveOutcome(outcome);
        /*
         * Чьи ответы анкеты унесёт элемент. На ПЕРЕНОСЕ — обе анкеты:
         * план-джоба у такого отчёта нет вовсе (он завёл бы второй
         * открытый элемент), а анкету плана фрейм показал — активный
         * план и есть перенос. Новым планом стал этот самый элемент,
         * значит ответы плана принадлежат ему; раньше они тихо
         * пропадали на фильтре по назначению (находка ревью).
         */
        const answerPurposes: readonly QuestionnaireAnswerPurpose[] = isMove
            ? ['report', 'plan']
            : ['report'];
        const stageCode = presentationStageForOutcome(outcome, job.isResult);
        const targetStage = info.stageIdByCode[stageCode];
        const reportEntry = job.reportComment
            ? `${now} Отчёт: ${job.reportComment}`
            : `${now} Отчёт: ${this.outcomeLabel(outcome, job.isResult)}`;

        // Спонтанная презентация НЕ закрывает чужой открытый элемент: она
        // фиксирует новую презентацию (так же ведёт себя unplanned
        // pres-сделка — её создают, а запланированную не трогают).
        const open = job.isSpontaneous
            ? null
            : await this.findOpenElement(bitrix, info, job);

        if (open) {
            const previous = this.previousComments(open, info);
            const fields: BxRow = { stageId: targetStage };
            this.setUf(fields, info, 'PRES_REPORT_COMMENT', job.reportComment);
            this.setUf(
                fields,
                info,
                'PRES_COMMENTS',
                [reportEntry, ...previous].slice(0, COMMENTS_LIMIT),
            );
            this.setEnum(
                fields,
                info,
                'PRES_RESULT',
                presentationResultCode(outcome, job.isResult),
            );

            if (isMove) {
                // Перенос: презентация не состоялась, но живёт дальше —
                // ни даты проведения, ни анкеты, только счётчик и даты.
                this.setUf(
                    fields,
                    info,
                    'PRES_MOVE_COUNT',
                    this.moveCount(open, info) + 1,
                );
                // Два РАЗНЫХ факта: КОГДА перенесли (сейчас) и НА КОГДА
                // перенесли (новый дедлайн) — легаси-список хранил только
                // второе и терял отчёт «когда переносили».
                this.setUf(fields, info, 'PRES_MOVE_DATE', now);
                this.setUf(
                    fields,
                    info,
                    'PRES_NEXT_CALL_DATE',
                    job.planDeadline,
                );
            } else {
                this.setUf(fields, info, 'PRES_DONE_DATE', now);
                this.setUf(fields, info, 'PRES_LAST_CALL_DATE', now);
                this.setUf(fields, info, 'PRES_RESPONSIBLE', job.responsibleId);
                this.applyFailReason(fields, info, job);
                this.applySurvey(fields, info, job);
            }
            /*
             * Ответы анкеты ОТЧЁТА — и на переносе тоже, в отличие от
             * снимка «5К»/«Хвост». Перенос это тоже отчёт менеджера: он
             * рассказал, что выяснил, а элемент остаётся открытым, и
             * ответы в нём честны. Снимок же фиксирует состояние клиента
             * на момент ЗАВЕРШЁННОЙ презентации — её ещё не было.
             */
            this.applyAnswers(fields, run, answerPurposes);

            await bitrix.item.update(
                Number(open.id),
                String(info.entityTypeId) as never,
                fields as never,
            );
            this.logger.log(
                `[presentation-flow] ${job.domain}: отчёт → элемент ${open.id} ` +
                    `${isMove ? 'перенесён' : 'закрыт'} (${outcome})`,
            );
            return {
                action: isMove ? 'moved' : 'closed',
                elementId: Number(open.id) || null,
            };
        }

        // Спонтанная (или потерявшая план) презентация: фиксируем факт сразу
        // в исходной стадии — как unplanned pres-сделка основного flow.
        const fields: BxRow = {
            title: `Презентация (незапланированная): ${now}`,
            stageId: targetStage,
            assignedById: job.responsibleId,
        };
        this.setUf(fields, info, 'PRES_IS_SPONTANEOUS', 'Y');
        this.setUf(fields, info, 'PRES_RESPONSIBLE', job.responsibleId);
        this.setUf(fields, info, 'PRES_REPORT_COMMENT', job.reportComment);
        this.setUf(fields, info, 'PRES_COMMENTS', [reportEntry]);
        this.setEnum(
            fields,
            info,
            'PRES_RESULT',
            presentationResultCode(outcome, job.isResult),
        );
        if (isMove) {
            // Перенос без плана — редкость (план потеряли), но элемент обязан
            // остаться открытым, иначе следующий отчёт заведёт ещё один.
            this.setUf(fields, info, 'PRES_MOVE_DATE', now);
            this.setUf(fields, info, 'PRES_NEXT_CALL_DATE', job.planDeadline);
        } else {
            this.setUf(fields, info, 'PRES_DONE_DATE', now);
            this.setUf(fields, info, 'PRES_LAST_CALL_DATE', now);
            this.applyFailReason(fields, info, job);
            this.applySurvey(fields, info, job);
        }
        this.applyLinks(fields, info, job);
        this.applyParents(fields, job);
        // Спонтанная презентация — тот самый «unplanned», ради которого
        // владелец и просил анкеты: элемента раньше не существовало, он
        // рождается прямо здесь и сразу с ответами.
        this.applyAnswers(fields, run, answerPurposes);

        const response = await bitrix.item.add(
            String(info.entityTypeId),
            fields as never,
        );
        const elementId = this.itemIdOf(response);
        this.logger.log(
            `[presentation-flow] ${job.domain}: спонтанная презентация → элемент ${elementId ?? '?'}`,
        );
        if (elementId) {
            await this.appendOpPresentations(
                bitrix,
                portal,
                info,
                job,
                elementId,
            );
        }
        return { action: 'spontaneous', elementId };
    }

    /**
     * Открытый элемент этого клиента: стадии заявка/план/перенос, совпадение
     * по базовой сделке (или компании, когда сделки нет, или лиду, когда нет
     * ни того ни другого). Фильтр по стадиям — серверный, матч по связи — в
     * JS: фильтрация crm.item.list по значению crm-поля ненадёжна.
     *
     * ОБЯЗАТЕЛЬНО listAll, а не list: crm.item.list отдаёт максимум 50
     * элементов за страницу, а открытых презентаций на активном портале
     * больше — элемент клиента не попадал в первую страницу, отчёт его «не
     * находил» и плодил спонтанные дубли. listAll листает курсором по id все
     * страницы (внутренний order id ASC — часть курсора, менять нельзя),
     * поэтому «самый свежий» выбирается уже по полной выборке. select сужает
     * payload до ключей, нужных матчу и последующему update (лента, счётчик).
     */
    private async findOpenElement(
        bitrix: FlowBitrix,
        info: PresentationSmartInfo,
        job: PresentationFlowJobData,
    ): Promise<BxRow | null> {
        /*
         * Открытые стадии берём из константы смарта, а не перечисляем: с
         * приходом контура согласования их стало четыре (заявка, на
         * согласовании, план, перенос), и забытая стадия означала бы, что
         * отчёт по ждущей согласования заявке заводит спонтанный дубль.
         */
        const openStages = PRESENTATION_OPEN_STAGE_CODES.map(
            code => info.stageIdByCode[code],
        ).filter((stageId): stageId is string => !!stageId);
        if (!openStages.length) return null;

        const baseKey = info.ufKeyByCode['PRES_BASE_DEAL'];
        const companyKey = info.ufKeyByCode['PRES_COMPANY'];
        const leadKey = info.ufKeyByCode['PRES_LEAD'];
        const select = [
            'id',
            baseKey,
            companyKey,
            leadKey,
            info.ufKeyByCode['PRES_COMMENTS'],
            info.ufKeyByCode['PRES_MOVE_COUNT'],
        ].filter((key): key is string => !!key);

        const rows = (await bitrix.item.listAll(
            String(info.entityTypeId),
            { stageId: openStages } as never,
            select,
        )) as unknown as BxRow[];

        const matches = rows.filter(row => {
            if (job.baseDealId && baseKey) {
                return this.hasLink(row[baseKey], `D_${job.baseDealId}`);
            }
            if (job.companyId && companyKey) {
                return this.hasLink(row[companyKey], `CO_${job.companyId}`);
            }
            // Лид-only клиент (заявка без компании и сделки): элемент при
            // создании связан только `L_x` — без этой ветки он не находился
            // и каждый отчёт заводил новый элемент.
            if (job.leadId && leadKey) {
                return this.hasLink(row[leadKey], `L_${job.leadId}`);
            }
            return false;
        });
        if (!matches.length) return null;
        // Последняя запланированная — самый свежий id.
        return matches.reduce((latest, row) =>
            Number(row.id) > Number(latest.id) ? row : latest,
        );
    }

    /**
     * Обратная ссылка на элемент в op_presentations сделки и компании
     * (append). Поле в реестре pbx есть, но на портале его может не быть —
     * тогда ссылки просто нет: элемент и так находится по своим crm-полям.
     */
    private async appendOpPresentations(
        bitrix: FlowBitrix,
        portal: PortalModel,
        info: PresentationSmartInfo,
        job: PresentationFlowJobData,
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
                PBX_SALES_EVENT_FIELD_CODES.op_presentations,
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
                // Обратная ссылка — удобство, не инвариант.
                this.logger.warn(
                    `[presentation-flow] op_presentations на ${target.entity} ${target.id} не записан: ${(error as Error).message}`,
                );
            }
        }
    }

    /**
     * Причина отказа ПОСЛЕ этой презентации — снимок на элемент.
     *
     * Пишется только при закрывающем отчёте: `failReasonCode` контекст
     * отдаёт исключительно на финальном отказе типа «Отказ» (гейт
     * EventReportContext.failReasonCode), поэтому «перенос» и «проведена»
     * сюда ничего не приносят. Незнакомый код справочника
     * (правили руками на портале) молча пропускается — стадия исход всё
     * равно несёт.
     */
    private applyFailReason(
        fields: BxRow,
        info: PresentationSmartInfo,
        job: PresentationFlowJobData,
    ): void {
        const itemCode = presentationFailReasonItemCode(job.failReasonCode);
        if (!itemCode) return;
        this.setEnum(fields, info, 'PRES_FAIL_REASON', itemCode);
    }

    /**
     * Ответы ПОРТАЛЬНОЙ анкеты в элемент.
     *
     * Пишутся в тот же объект `fields`, что и всё остальное — поэтому
     * покрыты все четыре случая (плановый элемент, закрываемый,
     * перенесённый, спонтанный) и не добавлено ни одного вызова Битрикса.
     *
     * Молча не теряем ничего: не прочитали живые поля — говорим об этом
     * числом; не легло конкретное поле — говорим ключом вопроса и
     * причиной (правило `setUf`: чужое значение не затираем).
     */
    private applyAnswers(
        fields: BxRow,
        run: PresentationFlowRun,
        purposes: readonly QuestionnaireAnswerPurpose[],
    ): void {
        const answers = run.job.answers ?? [];
        if (!answers.length) return;

        if (!run.itemFields) {
            this.logger.warn(
                `[presentation-flow] ${run.job.domain}: поля элемента не ` +
                    `прочитаны — ${answers.length} ответ(ов) анкеты не записаны`,
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
            this.logger.warn(
                `[presentation-flow] ${run.job.domain}: ${warning}`,
            );
        }
        if (applied) {
            this.logger.log(
                `[presentation-flow] ${run.job.domain}: ответов анкеты в ` +
                    `элемент (${purposes.join('+')}) — ${applied}`,
            );
        }
    }

    /** Анкета «5К»/«Хвост» — снимок на момент отчёта (см. джоб). */
    private applySurvey(
        fields: BxRow,
        info: PresentationSmartInfo,
        job: PresentationFlowJobData,
    ): void {
        for (const [code, value] of Object.entries(job.survey ?? {})) {
            this.setUf(fields, info, code as PresentationSmartFieldCode, value);
        }
    }

    /**
     * РОДИТЕЛИ элемента — системные поля `parentId{entityTypeId}`.
     *
     * Зеркало zpr-flow: наши crm-поля хранят связь для нашего кода, а
     * вкладку в карточке и штатный фильтр «презентации этой сделки»
     * Битрикс строит ТОЛЬКО по системному родителю.
     */
    private applyParents(fields: BxRow, job: PresentationFlowJobData): void {
        if (job.baseDealId) fields['parentId2'] = job.baseDealId;
        if (job.companyId) fields['parentId4'] = job.companyId;
        if (job.leadId) fields['parentId1'] = job.leadId;
        if (job.contactId) fields['parentId3'] = job.contactId;
    }

    private applyLinks(
        fields: BxRow,
        info: PresentationSmartInfo,
        job: PresentationFlowJobData,
    ): void {
        if (job.baseDealId) {
            this.setUf(fields, info, 'PRES_BASE_DEAL', [`D_${job.baseDealId}`]);
        }
        if (job.presDealId) {
            this.setUf(fields, info, 'PRES_DEAL', [`D_${job.presDealId}`]);
        }
        if (job.tmcDealId) {
            // Связь с ТМЦ-сделкой прямо в элементе: сегодня её резолвят
            // обходом через pres-сделку (UF_CRM_TO_PRESENTATION_SALES), и
            // после отказа от pres-сделок этот путь исчезнет.
            this.setUf(fields, info, 'PRES_TMC_DEAL', [`D_${job.tmcDealId}`]);
        }
        if (job.companyId) {
            this.setUf(fields, info, 'PRES_COMPANY', [`CO_${job.companyId}`]);
        }
        if (job.leadId) {
            this.setUf(fields, info, 'PRES_LEAD', [`L_${job.leadId}`]);
            // Лид среди привязок = клиент пришёл заявкой/лидогеном.
            this.setUf(fields, info, 'PRES_IS_OUR_REQUEST', 'Y');
        }
        if (job.contactId) {
            this.setUf(fields, info, 'PRES_CONTACT', [`C_${job.contactId}`]);
        }
    }

    /** Накопительная лента комментариев уже существующего элемента. */
    private previousComments(
        open: BxRow,
        info: PresentationSmartInfo,
    ): string[] {
        const commentsKey = info.ufKeyByCode['PRES_COMMENTS'];
        return commentsKey && Array.isArray(open[commentsKey])
            ? (open[commentsKey] as unknown[]).map(String)
            : [];
    }

    /** Текущее число переносов элемента (пусто/мусор → 0). */
    private moveCount(open: BxRow, info: PresentationSmartInfo): number {
        const key = info.ufKeyByCode['PRES_MOVE_COUNT'];
        const value = key ? Number(open[key]) : 0;
        return Number.isFinite(value) && value > 0 ? value : 0;
    }

    /** Значение по фактическому camel-ключу поля; пусто — пропуск. */
    private setUf(
        fields: BxRow,
        info: PresentationSmartInfo,
        code: PresentationSmartFieldCode,
        value: unknown,
    ): void {
        if (value === null || value === undefined || value === '') return;
        if (Array.isArray(value) && !value.length) return;
        const key = info.ufKeyByCode[code];
        if (!key) return;
        fields[key] = value;
    }

    /**
     * Значение enumeration-поля: Bitrix ждёт ЧИСЛОВОЙ id значения, а не код.
     * Код не резолвится (справочник правили руками) — поле пропускается,
     * стадия исход всё равно несёт.
     */
    private setEnum(
        fields: BxRow,
        info: PresentationSmartInfo,
        code: PresentationSmartFieldCode,
        itemCode: string,
    ): void {
        const item = (info.enumItems[code] ?? []).find(
            candidate => candidate.code === itemCode,
        );
        if (!item) return;
        this.setUf(fields, info, code, item.id);
    }

    /** Человекочитаемый исход для ленты комментариев. */
    private outcomeLabel(outcome: string, isResult: boolean): string {
        if (outcome === PRESENTATION_OUTCOME.expired) return 'перенесена';
        if (outcome === PRESENTATION_OUTCOME.fail) {
            return isResult ? 'отказ после презентации' : 'не состоялась';
        }
        if (outcome === PRESENTATION_OUTCOME.noresult) return 'не состоялась';
        return 'проведена';
    }

    private hasLink(raw: unknown, ref: string): boolean {
        if (Array.isArray(raw)) return raw.map(String).includes(ref);
        return String(raw ?? '') === ref;
    }

    private itemIdOf(response: unknown): number | null {
        const item = (response as { result?: { item?: { id?: unknown } } })
            ?.result?.item;
        const id = Number(item?.id);
        return Number.isFinite(id) && id > 0 ? id : null;
    }
}
