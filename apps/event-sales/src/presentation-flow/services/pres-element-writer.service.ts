import { Logger } from '@nestjs/common';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { FlowBitrix } from '../../shared/side-flow';
import { QuestionnaireAnswerPurpose } from '../../shared/questionnaire-answers';
import { PresentationFlowResult } from '../constants/presentation-flow.const';
import {
    isPresentationMoveOutcome,
    PRESENTATION_OUTCOME,
    PresentationOutcome,
    presentationResultCode,
} from '../lib/presentation-outcome';
import {
    BxRow,
    PresentationFlowRun,
} from '../types/presentation-flow-run.type';
import { PresElementFieldsBuilder } from './pres-element-fields.builder';
import { PresElementLinksBuilder } from './pres-element-links.builder';
import { presStageForOutcome, presStageId } from './pres-stage.resolver';
import { PresElementLookupService } from './pres-element-lookup.service';
import { PresBacklinkService } from './pres-backlink.service';

/** Лента комментариев элемента не растёт бесконечно. */
const COMMENTS_LIMIT = 50;

/** id созданного элемента из ответа `crm.item.add`; иначе null. */
function itemIdOf(response: unknown): number | null {
    const item = (response as { result?: { item?: { id?: unknown } } })?.result
        ?.item;
    const id = Number(item?.id);
    return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * ЗАПИСЬ элемента презентации: план → создать, отчёт → закрыть/перенести
 * открытый (или создать спонтанный) — зеркало ZprElementWriterService.
 *
 * Ремонтируешь «создалась/закрылась не так» — сцены здесь, а реквизит по
 * специализированным модулям: поля — pres-element-fields.builder, связи —
 * pres-element-links.builder, стадии — pres-stage.resolver, выбор «какой
 * элемент тот самый» — pres-element-lookup, обратная ссылка —
 * pres-backlink.
 *
 * `bitrix`/`portal` приходят в конструктор — класс создаётся на прогон
 * джоба, а не инжектится: инстанс Битрикса привязан к домену портала
 * (правило CLAUDE.md).
 */
export class PresElementWriterService {
    private readonly logger = new Logger(PresElementWriterService.name);
    private readonly lookup: PresElementLookupService;
    private readonly backlink: PresBacklinkService;

    constructor(
        private readonly bitrix: FlowBitrix,
        portal: PortalModel,
    ) {
        this.lookup = new PresElementLookupService(bitrix);
        this.backlink = new PresBacklinkService(bitrix, portal);
    }

    /** План презентации → элемент в «Запланирована». */
    async createPlanned(
        run: PresentationFlowRun,
    ): Promise<PresentationFlowResult> {
        const { info, job, now } = run;
        const fields_ = new PresElementFieldsBuilder(run);
        const links = new PresElementLinksBuilder(run);
        const fields: BxRow = {
            title: `Презентация: ${job.planName || job.planDeadline || now}`,
            stageId: presStageId(info, 'pres_plan'),
            assignedById: job.responsibleId,
        };
        fields_.setUf(fields, 'PRES_PLAN_DATE', job.planDeadline);
        fields_.setUf(fields, 'PRES_RESPONSIBLE', job.responsibleId);
        fields_.setUf(fields, 'PRES_PLAN_RESPONSIBLE', job.planResponsibleId);
        fields_.setUf(fields, 'PRES_PLAN_COMMENT', job.planComment);
        fields_.setUf(
            fields,
            'PRES_COMMENTS',
            job.planComment ? [`${now} План: ${job.planComment}`] : null,
        );
        fields_.setUf(fields, 'PRES_NEXT_CALL_DATE', job.planDeadline);
        links.applyLinks(fields);
        links.applyParents(fields);
        links.applyClient(fields);
        // Ответы анкеты ПЛАНА — последними: поля, которые заполняет сам
        // поток, к этому моменту уже стоят, и их не перезаписать.
        fields_.applyAnswers(fields, ['plan']);

        const elementId = await this.add(run, fields);
        this.logger.log(
            `[presentation-flow] ${job.domain}: план → элемент ${elementId ?? '?'} ` +
                `(op=${job.operationId ?? '-'})`,
        );
        return { action: 'created', elementId };
    }

    /**
     * Отчёт по презентации → закрыть (или перенести) открытый элемент;
     * плана не было — создать спонтанный сразу с исходом.
     */
    async closeReported(
        run: PresentationFlowRun,
    ): Promise<PresentationFlowResult> {
        const { info, job, now } = run;
        const fields_ = new PresElementFieldsBuilder(run);
        const links = new PresElementLinksBuilder(run);
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
        const targetStage = presStageForOutcome(info, outcome, job.isResult);
        // Целевой стадии нет на портале (смарт установлен не полностью) —
        // отчёт менеджера терять нельзя: пишем всё остальное без смены
        // стадии, а не молча шлём `stageId: undefined`.
        if (!targetStage) {
            this.logger.warn(
                `[presentation-flow] ${job.domain}: стадия исхода ` +
                    `«${outcome}» не найдена на портале — отчёт записан ` +
                    'без смены стадии',
            );
        }
        const reportEntry = job.reportComment
            ? `${now} Отчёт: ${job.reportComment}`
            : `${now} Отчёт: ${this.outcomeLabel(outcome, job.isResult)}`;

        // Спонтанная презентация НЕ закрывает чужой открытый элемент: она
        // фиксирует новую презентацию (так же ведёт себя unplanned
        // pres-сделка — её создают, а запланированную не трогают).
        const open = job.isSpontaneous
            ? null
            : await this.lookup.findOpenElement(info, job);

        if (open) {
            const previous = this.previousComments(fields_, open);
            const fields: BxRow = targetStage ? { stageId: targetStage } : {};
            fields_.setUf(fields, 'PRES_REPORT_COMMENT', job.reportComment);
            fields_.setUf(
                fields,
                'PRES_COMMENTS',
                [reportEntry, ...previous].slice(0, COMMENTS_LIMIT),
            );
            fields_.setEnum(
                fields,
                'PRES_RESULT',
                presentationResultCode(outcome, job.isResult),
            );

            if (isMove) {
                // Перенос: презентация не состоялась, но живёт дальше —
                // ни даты проведения, ни анкеты, только счётчик и даты.
                fields_.setUf(
                    fields,
                    'PRES_MOVE_COUNT',
                    this.moveCount(fields_, open) + 1,
                );
                // Два РАЗНЫХ факта: КОГДА перенесли (сейчас) и НА КОГДА
                // перенесли (новый дедлайн) — легаси-список хранил только
                // второе и терял отчёт «когда переносили».
                fields_.setUf(fields, 'PRES_MOVE_DATE', now);
                fields_.setUf(fields, 'PRES_NEXT_CALL_DATE', job.planDeadline);
            } else {
                fields_.setUf(fields, 'PRES_DONE_DATE', now);
                fields_.setUf(fields, 'PRES_LAST_CALL_DATE', now);
                fields_.setUf(fields, 'PRES_RESPONSIBLE', job.responsibleId);
                fields_.applyFailReason(fields);
                fields_.applySurvey(fields);
            }
            /*
             * Ответы анкеты ОТЧЁТА — и на переносе тоже, в отличие от
             * снимка «5К»/«Хвост». Перенос это тоже отчёт менеджера: он
             * рассказал, что выяснил, а элемент остаётся открытым, и
             * ответы в нём честны. Снимок же фиксирует состояние клиента
             * на момент ЗАВЕРШЁННОЙ презентации — её ещё не было.
             */
            fields_.applyAnswers(fields, answerPurposes);

            await this.bitrix.item.update(
                Number(open.id),
                String(info.entityTypeId) as never,
                fields as never,
            );
            this.logger.log(
                `[presentation-flow] ${job.domain}: отчёт → элемент ` +
                    `${String(open.id)} ` +
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
            ...(targetStage ? { stageId: targetStage } : {}),
            assignedById: job.responsibleId,
        };
        fields_.setUf(fields, 'PRES_IS_SPONTANEOUS', 'Y');
        fields_.setUf(fields, 'PRES_RESPONSIBLE', job.responsibleId);
        fields_.setUf(fields, 'PRES_REPORT_COMMENT', job.reportComment);
        fields_.setUf(fields, 'PRES_COMMENTS', [reportEntry]);
        fields_.setEnum(
            fields,
            'PRES_RESULT',
            presentationResultCode(outcome, job.isResult),
        );
        if (isMove) {
            // Перенос без плана — редкость (план потеряли), но элемент обязан
            // остаться открытым, иначе следующий отчёт заведёт ещё один.
            fields_.setUf(fields, 'PRES_MOVE_DATE', now);
            fields_.setUf(fields, 'PRES_NEXT_CALL_DATE', job.planDeadline);
        } else {
            fields_.setUf(fields, 'PRES_DONE_DATE', now);
            fields_.setUf(fields, 'PRES_LAST_CALL_DATE', now);
            fields_.applyFailReason(fields);
            fields_.applySurvey(fields);
        }
        links.applyLinks(fields);
        links.applyParents(fields);
        links.applyClient(fields);
        // Спонтанная презентация — тот самый «unplanned», ради которого
        // владелец и просил анкеты: элемента раньше не существовало, он
        // рождается прямо здесь и сразу с ответами.
        fields_.applyAnswers(fields, answerPurposes);

        const elementId = await this.add(run, fields);
        this.logger.log(
            `[presentation-flow] ${job.domain}: спонтанная презентация → элемент ${elementId ?? '?'}`,
        );
        return { action: 'spontaneous', elementId };
    }

    /** Человекочитаемый исход для ленты комментариев. */
    private outcomeLabel(
        outcome: PresentationOutcome,
        isResult: boolean,
    ): string {
        if (outcome === PRESENTATION_OUTCOME.expired) return 'перенесена';
        if (outcome === PRESENTATION_OUTCOME.fail) {
            return isResult ? 'отказ после презентации' : 'не состоялась';
        }
        if (outcome === PRESENTATION_OUTCOME.noresult) return 'не состоялась';
        return 'проведена';
    }

    /** Накопительная лента комментариев уже существующего элемента. */
    private previousComments(
        fields_: PresElementFieldsBuilder,
        open: BxRow,
    ): string[] {
        const commentsKey = fields_.ufKey('PRES_COMMENTS');
        return commentsKey && Array.isArray(open[commentsKey])
            ? (open[commentsKey] as unknown[]).map(String)
            : [];
    }

    /** Текущее число переносов элемента (пусто/мусор → 0). */
    private moveCount(fields_: PresElementFieldsBuilder, open: BxRow): number {
        const key = fields_.ufKey('PRES_MOVE_COUNT');
        const value = key ? Number(open[key]) : 0;
        return Number.isFinite(value) && value > 0 ? value : 0;
    }

    /** Новый элемент + обратная ссылка op_presentations (если создан). */
    private async add(
        run: PresentationFlowRun,
        fields: BxRow,
    ): Promise<number | null> {
        const response = await this.bitrix.item.add(
            String(run.info.entityTypeId),
            fields as never,
        );
        const elementId = itemIdOf(response);
        if (elementId) {
            await this.backlink.appendOpPresentations(
                run.info,
                run.job,
                elementId,
            );
        }
        return elementId;
    }
}
