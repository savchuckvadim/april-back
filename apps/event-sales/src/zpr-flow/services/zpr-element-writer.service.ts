import { Logger } from '@nestjs/common';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { FlowBitrix } from '../../shared/side-flow';
import { QuestionnaireAnswerPurpose } from '../../shared/questionnaire-answers';
import { ZprFlowResult } from '../constants/zpr-flow.const';
import { BxRow, ZprFlowRun } from '../types/zpr-flow-run.type';
import {
    itemIdOf,
    ZprElementFieldsBuilder,
} from './zpr-element-fields.builder';
import { ZprElementLookupService } from './zpr-element-lookup.service';
import { ZprBacklinkService } from './zpr-backlink.service';

/** Лента комментариев элемента не растёт бесконечно. */
const COMMENTS_LIMIT = 50;

/**
 * Запись элемента ЗПР: план → создать, отчёт → закрыть открытый (или
 * создать спонтанный), перенос → сдвинуть открытый в «Ожидание».
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
        const builder = new ZprElementFieldsBuilder(run);
        const fields: BxRow = {
            title: `ЗПР: ${job.planName || job.planDeadline || now}`,
            stageId: builder.stageId('zpr_plan'),
            assignedById: job.responsibleId,
        };
        builder.setUf(fields, 'ZPR_PLAN_DATE', job.planDeadline);
        builder.setUf(fields, 'ZPR_RESPONSIBLE', job.responsibleId);
        builder.setUf(fields, 'ZPR_PLAN_COMMENT', job.planComment);
        builder.setUf(
            fields,
            'ZPR_COMMENTS',
            job.planComment ? [`${now} План: ${job.planComment}`] : null,
        );
        builder.setUf(fields, 'ZPR_NEXT_CALL_DATE', job.planDeadline);
        builder.applyLinks(fields);
        builder.applyParents(fields);
        // Ответы анкеты — последними: поля, которые заполняет сам поток,
        // к этому моменту уже стоят, и их не перезаписать.
        builder.applyAnswers(fields, purposes);

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
        const builder = new ZprElementFieldsBuilder(run);
        const open = await this.lookup.findOpenElement(run.info, job);

        // Перенос: элемент живёт дальше в «Ожидании», задача та же —
        // закрытие и новый элемент означали бы фантомный «не состоялся»
        // и дубль открытого. Открытого нет — честно создаём план заново.
        if (job.isMove) {
            // Элемент заводится ради ЭТОГО отчёта и сразу становится
            // новым планом — значит несёт обе анкеты: отчётные ответы
            // иначе исчезли бы, другого элемента у них нет.
            if (!open) return this.createPlanned(run, ['plan', 'report']);
            return this.moveOpen(run, builder, open);
        }

        const targetStage = builder.resolveClosingStage();
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
        const reportEntry = job.reportComment
            ? `${now} Отчёт: ${job.reportComment}`
            : `${now} Отчёт: ${job.isResult ? 'состоялся' : 'не состоялся'}`;

        if (open) {
            const openId = Number(open.id);
            const fields: BxRow = targetStage ? { stageId: targetStage } : {};
            builder.setUf(fields, 'ZPR_DONE_DATE', now);
            builder.setUf(fields, 'ZPR_LAST_CALL_DATE', now);
            builder.setUf(fields, 'ZPR_REPORT_COMMENT', job.reportComment);
            builder.setUf(
                fields,
                'ZPR_COMMENTS',
                [reportEntry, ...this.previousComments(builder, open)].slice(
                    0,
                    COMMENTS_LIMIT,
                ),
            );
            builder.applySurvey(fields);
            builder.applyAnswers(fields, ['report']);
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
        builder.setUf(fields, 'ZPR_IS_SPONTANEOUS', 'Y');
        builder.setUf(fields, 'ZPR_DONE_DATE', now);
        builder.setUf(fields, 'ZPR_LAST_CALL_DATE', now);
        builder.setUf(fields, 'ZPR_RESPONSIBLE', job.responsibleId);
        builder.setUf(fields, 'ZPR_REPORT_COMMENT', job.reportComment);
        builder.setUf(fields, 'ZPR_COMMENTS', [reportEntry]);
        builder.applyLinks(fields);
        builder.applyParents(fields);
        builder.applySurvey(fields);
        // Спонтанный ЗПР: элемента раньше не существовало, он рождается
        // прямо здесь и сразу с ответами анкеты.
        builder.applyAnswers(fields, ['report']);

        const elementId = await this.add(run, fields);
        this.logger.log(
            `[zpr-flow] ${job.domain}: спонтанный ЗПР → элемент ${elementId ?? '?'}`,
        );
        return { action: 'spontaneous', elementId };
    }

    /** Перенос: открытый элемент сдвигается в «Ожидание», не закрываясь. */
    private async moveOpen(
        run: ZprFlowRun,
        builder: ZprElementFieldsBuilder,
        open: BxRow,
    ): Promise<ZprFlowResult> {
        const { job, now } = run;
        const openId = Number(open.id);
        const fields: BxRow = {
            stageId: builder.stageId('zpr_pending'),
        };
        builder.setUf(fields, 'ZPR_PLAN_DATE', job.planDeadline);
        builder.setUf(fields, 'ZPR_NEXT_CALL_DATE', job.planDeadline);
        const moveKey = builder.ufKey('ZPR_MOVE_COUNT');
        if (moveKey) {
            fields[moveKey] = (Number(open[moveKey]) || 0) + 1;
        }
        const moveEntry =
            `${now} Перенос: ${job.planName || ''} → ` +
            `${job.planDeadline ?? '?'}`;
        builder.setUf(
            fields,
            'ZPR_COMMENTS',
            [moveEntry.trim(), ...this.previousComments(builder, open)].slice(
                0,
                COMMENTS_LIMIT,
            ),
        );
        // Перенос — тоже отчёт менеджера: он рассказал, что выяснил,
        // а элемент остаётся открытым, и ответы в нём честны. Анкета
        // ПЛАНА — сюда же: план-джоба у переноса нет вовсе, новым
        // планом стал этот самый элемент.
        builder.applyAnswers(fields, ['report', 'plan']);
        await this.update(run, openId, fields);
        this.logger.log(
            `[zpr-flow] ${job.domain}: перенос → элемент ${openId} в ожидании`,
        );
        return { action: 'moved', elementId: openId || null };
    }

    /** Накопленная лента элемента; поля нет или пусто — пустой список. */
    private previousComments(
        builder: ZprElementFieldsBuilder,
        open: BxRow,
    ): string[] {
        const key = builder.ufKey('ZPR_COMMENTS');
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
