import { Logger } from '@nestjs/common';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { FlowBitrix } from '../../shared/side-flow';
import { toMultiFieldEntryText } from '@lib/bitrix/consts/batch.consts';
import { QuestionnaireAnswerPurpose } from '../../shared/questionnaire-answers';
import { ZprFlowResult } from '../constants/zpr-flow.const';
import { BxRow, ZprFlowRun } from '../types/zpr-flow-run.type';
import { ZprElementFieldsBuilder } from './zpr-element-fields.builder';
import { ZprElementLinksBuilder } from './zpr-element-links.builder';
import { ZprStageResolver } from './zpr-stage.resolver';
import { ZprElementLookupService } from './zpr-element-lookup.service';
import { ZprBacklinkService } from './zpr-backlink.service';

/** Лента комментариев элемента не растёт бесконечно. */
const COMMENTS_LIMIT = 50;

/** id созданного элемента из ответа `crm.item.add`; иначе null. */
export function itemIdOf(response: unknown): number | null {
    const item = (response as { result?: { item?: { id?: unknown } } })?.result
        ?.item;
    const id = Number(item?.id);
    return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * ЗАПИСЬ элемента ЗПР: план → создать, отчёт → закрыть открытый (или
 * создать спонтанный), перенос → сдвинуть открытый в «Ожидание».
 *
 * Ремонтируешь «создался/закрылся не так» — сцены здесь, а реквизит по
 * специализированным модулям: поля — zpr-element-fields.builder, связи —
 * zpr-element-links.builder, стадии — zpr-stage.resolver, выбор «какой
 * элемент тот самый» — zpr-element-lookup.
 *
 * История комментариев — требование владельца: план-коммент при создании,
 * отчёт-коммент при закрытии, всё дублируется в накопительную ленту
 * ZPR_COMMENTS.
 *
 * `bitrix`/`portal` приходят в конструктор — класс создаётся на прогон
 * джоба (`new ZprElementWriterService(bitrix, portal)`), а не инжектится:
 * инстанс Битрикса привязан к домену портала (правило CLAUDE.md).
 */
export class ZprElementWriterService {
    private readonly logger = new Logger(ZprElementWriterService.name);
    private readonly lookup: ZprElementLookupService;
    private readonly backlink: ZprBacklinkService;

    constructor(
        private readonly bitrix: FlowBitrix,
        portal: PortalModel,
    ) {
        this.lookup = new ZprElementLookupService(bitrix);
        this.backlink = new ZprBacklinkService(bitrix, portal);
    }

    /**
     * План ЗПР → элемент в «Запланирован».
     *
     * `purposes` — чьи ответы анкеты кладём. Обычно только плановые, но
     * на ПЕРЕНОСЕ без открытого элемента этот элемент рождается ради
     * самого отчёта, и отчётные ответы едут в него же: другого
     * элемента у них не будет, а молча терять их нельзя.
     */
    async createPlanned(
        run: ZprFlowRun,
        purposes: readonly QuestionnaireAnswerPurpose[],
    ): Promise<ZprFlowResult> {
        const { job, now } = run;
        const fields_ = new ZprElementFieldsBuilder(run);
        const links = new ZprElementLinksBuilder(run);
        const stages = new ZprStageResolver(run);
        const fields: BxRow = {
            title: `ЗПР: ${job.planName || job.planDeadline || now}`,
            stageId: stages.stageId('zpr_plan'),
            assignedById: job.responsibleId,
        };
        fields_.setUf(fields, 'ZPR_PLAN_DATE', job.planDeadline);
        fields_.setUf(fields, 'ZPR_RESPONSIBLE', job.responsibleId);
        fields_.setUf(fields, 'ZPR_PLAN_COMMENT', job.planComment);
        fields_.setUf(
            fields,
            'ZPR_COMMENTS',
            // Запись ленты — одна строка: multiple-поле рисует внутренние
            // переносы подчёркиванием (см. toMultiFieldEntryText).
            job.planComment
                ? [toMultiFieldEntryText(`${now} План: ${job.planComment}`)]
                : null,
        );
        fields_.setUf(fields, 'ZPR_NEXT_CALL_DATE', job.planDeadline);
        links.applyLinks(fields);
        links.applyParents(fields);
        links.applyClient(fields);
        // Снимок клиента (плановая дата покупки) — и на ПЛАНЕ: звонок по
        // решению и есть разговор о покупке, элемент обязан нести дату
        // сразу (владелец 31.08). На закрытии снимок пишется своей веткой.
        fields_.applySurvey(fields);
        // Ответы анкеты — последними: поля, которые заполняет сам поток,
        // к этому моменту уже стоят, и их не перезаписать.
        fields_.applyAnswers(fields, purposes);

        const elementId = await this.add(run, fields);
        this.logger.log(
            `[zpr-flow] ${job.domain}: план → элемент ${elementId ?? '?'} ` +
                `(op=${job.operationId ?? '-'})`,
        );
        return { action: 'created', elementId };
    }

    /**
     * Отчёт по ЗПР-задаче → закрыть открытый элемент; не нашли — создать
     * спонтанный сразу с исходом (как спонтанные презентации).
     */
    async closeReported(run: ZprFlowRun): Promise<ZprFlowResult> {
        const { job, now } = run;
        const fields_ = new ZprElementFieldsBuilder(run);
        const links = new ZprElementLinksBuilder(run);
        const stages = new ZprStageResolver(run);
        const open = await this.lookup.findOpenElement(run.info, job);

        // Перенос: элемент живёт дальше в «Ожидании», задача та же —
        // закрытие и новый элемент означали бы фантомный «не состоялся»
        // и дубль открытого. Открытого нет — честно создаём план заново.
        if (job.isMove) {
            // Элемент заводится ради ЭТОГО отчёта и сразу становится
            // новым планом — значит несёт обе анкеты: отчётные ответы
            // иначе исчезли бы, другого элемента у них нет.
            if (!open) return this.createPlanned(run, ['plan', 'report']);
            return this.moveOpen(run, fields_, stages, open);
        }

        const targetStage = stages.resolveClosingStage();
        // Закрывающей стадии нет на портале (смарт установлен не полностью).
        // Отчёт менеджера при этом терять нельзя: пишем всё остальное, а
        // стадию не трогаем — элемент останется открытым, и это видно в
        // воронке. Раньше сюда молча уезжал `stageId: undefined`.
        if (!targetStage) {
            this.logger.warn(
                `[zpr-flow] ${job.domain}: закрывающая стадия не найдена на ` +
                    'портале — отчёт записан без смены стадии',
            );
        }
        const reportEntry = toMultiFieldEntryText(
            job.reportComment
                ? `${now} Отчёт: ${job.reportComment}`
                : `${now} Отчёт: ${job.isResult ? 'состоялся' : 'не состоялся'}`,
        );

        if (open) {
            const openId = Number(open.id);
            const fields: BxRow = targetStage ? { stageId: targetStage } : {};
            fields_.setUf(fields, 'ZPR_DONE_DATE', now);
            fields_.setUf(fields, 'ZPR_LAST_CALL_DATE', now);
            fields_.setUf(fields, 'ZPR_REPORT_COMMENT', job.reportComment);
            fields_.setUf(
                fields,
                'ZPR_COMMENTS',
                [reportEntry, ...this.previousComments(fields_, open)].slice(
                    0,
                    COMMENTS_LIMIT,
                ),
            );
            fields_.applySurvey(fields);
            fields_.applyAnswers(fields, ['report']);
            await this.update(run, openId, fields);
            this.logger.log(
                `[zpr-flow] ${job.domain}: отчёт → элемент ${openId} закрыт ` +
                    `(${job.isResult ? 'состоялся' : 'не состоялся'})`,
            );
            return { action: 'closed', elementId: openId || null };
        }

        // Спонтанный ЗПР: плана не было — фиксируем факт сразу закрытым.
        // Стадии нет — элемент всё равно создаём (Битрикс положит его в
        // первую стадию воронки): потерять факт звонка хуже, чем создать
        // его открытым.
        const fields: BxRow = {
            title: `ЗПР (спонтанный): ${now}`,
            ...(targetStage ? { stageId: targetStage } : {}),
            assignedById: job.responsibleId,
        };
        fields_.setUf(fields, 'ZPR_IS_SPONTANEOUS', 'Y');
        fields_.setUf(fields, 'ZPR_DONE_DATE', now);
        fields_.setUf(fields, 'ZPR_LAST_CALL_DATE', now);
        fields_.setUf(fields, 'ZPR_RESPONSIBLE', job.responsibleId);
        fields_.setUf(fields, 'ZPR_REPORT_COMMENT', job.reportComment);
        fields_.setUf(fields, 'ZPR_COMMENTS', [reportEntry]);
        links.applyLinks(fields);
        links.applyParents(fields);
        links.applyClient(fields);
        fields_.applySurvey(fields);
        // Спонтанный ЗПР: элемента раньше не существовало, он рождается
        // прямо здесь и сразу с ответами анкеты.
        fields_.applyAnswers(fields, ['report']);

        const elementId = await this.add(run, fields);
        this.logger.log(
            `[zpr-flow] ${job.domain}: спонтанный ЗПР → элемент ${elementId ?? '?'}`,
        );
        return { action: 'spontaneous', elementId };
    }

    /** Перенос: открытый элемент сдвигается в «Ожидание», не закрываясь. */
    private async moveOpen(
        run: ZprFlowRun,
        fields_: ZprElementFieldsBuilder,
        stages: ZprStageResolver,
        open: BxRow,
    ): Promise<ZprFlowResult> {
        const { job, now } = run;
        const openId = Number(open.id);
        const fields: BxRow = {
            stageId: stages.stageId('zpr_pending'),
        };
        fields_.setUf(fields, 'ZPR_PLAN_DATE', job.planDeadline);
        fields_.setUf(fields, 'ZPR_NEXT_CALL_DATE', job.planDeadline);
        const moveKey = fields_.ufKey('ZPR_MOVE_COUNT');
        if (moveKey) {
            fields[moveKey] = (Number(open[moveKey]) || 0) + 1;
        }
        const moveEntry =
            `${now} Перенос: ${job.planName || ''} → ` +
            `${job.planDeadline ?? '?'}`;
        fields_.setUf(
            fields,
            'ZPR_COMMENTS',
            [moveEntry.trim(), ...this.previousComments(fields_, open)].slice(
                0,
                COMMENTS_LIMIT,
            ),
        );
        // Перенос — тоже отчёт менеджера: он рассказал, что выяснил,
        // а элемент остаётся открытым, и ответы в нём честны. Анкета
        // ПЛАНА — сюда же: план-джоба у переноса нет вовсе, новым
        // планом стал этот самый элемент.
        fields_.applyAnswers(fields, ['report', 'plan']);
        await this.update(run, openId, fields);
        this.logger.log(
            `[zpr-flow] ${job.domain}: перенос → элемент ${openId} в ожидании`,
        );
        return { action: 'moved', elementId: openId || null };
    }

    /** Накопленная лента элемента; поля нет или пусто — пустой список. */
    private previousComments(
        fields_: ZprElementFieldsBuilder,
        open: BxRow,
    ): string[] {
        const key = fields_.ufKey('ZPR_COMMENTS');
        const raw = key ? open[key] : null;
        return Array.isArray(raw) ? raw.map(String) : [];
    }

    /** Новый элемент + обратная ссылка op_zprs (только если элемент создан). */
    private async add(run: ZprFlowRun, fields: BxRow): Promise<number | null> {
        const response = await this.bitrix.item.add(
            String(run.info.entityTypeId),
            fields as never,
        );
        const elementId = itemIdOf(response);
        if (elementId) {
            await this.backlink.appendOpZprs(run.info, run.job, elementId);
        }
        return elementId;
    }

    private async update(
        run: ZprFlowRun,
        elementId: number,
        fields: BxRow,
    ): Promise<void> {
        await this.bitrix.item.update(
            elementId,
            String(run.info.entityTypeId) as never,
            fields as never,
        );
    }
}
