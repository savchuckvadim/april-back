import { Logger } from '@nestjs/common';
import {
    PresentationSmartFieldCode,
    PresentationSmartInfo,
    presentationFailReasonItemCode,
} from '@lib/portal-lib/pbx/pbx-presentation-smart';
import {
    applyQuestionnaireAnswers,
    buildMirrorItemsByKey,
    QuestionnaireAnswerPurpose,
} from '../../shared/questionnaire-answers';
import {
    BxRow,
    PresentationFlowRun,
} from '../types/presentation-flow-run.type';

/**
 * ЧИСТО ПОЛЯ элемента презентации: адресация UF-ключей и раскладка значений
 * (зеркало zpr-element-fields.builder).
 *
 * Ремонтируешь «значение не записалось» / «ответ анкеты не доехал» /
 * «снимок 5К лёг не туда» / «enum не сохранился» — идти сюда. Стадии — в
 * pres-stage.resolver, связи с сущностями — в pres-element-links.builder.
 */

/**
 * Фактический camel-ключ поля по его коду; `undefined` — поля нет на
 * портале (старая установка смарта), и писать/читать по нему нечего.
 * Функция, а не индексация — защита от опечаток при `noImplicitAny: false`
 * (см. развёрнутое «почему» у zprStageId).
 */
export function presUfKey(
    info: PresentationSmartInfo,
    code: PresentationSmartFieldCode,
): string | undefined {
    return info.ufKeyByCode[code];
}

/**
 * Значение по фактическому ключу поля; пусто/незаведённое поле — пропуск.
 * Standalone: раскладку делает и links-builder, а правила пропуска обязаны
 * быть одними на всех писателей.
 */
export function presSetUf(
    info: PresentationSmartInfo,
    fields: BxRow,
    code: PresentationSmartFieldCode,
    value: unknown,
): void {
    if (value === null || value === undefined || value === '') return;
    if (Array.isArray(value) && !value.length) return;
    const key = presUfKey(info, code);
    if (!key) return;
    fields[key] = value;
}

export class PresElementFieldsBuilder {
    private readonly logger = new Logger(PresElementFieldsBuilder.name);

    constructor(private readonly run: PresentationFlowRun) {}

    /** Фактический camel-ключ поля смарта на этом портале. */
    ufKey(code: PresentationSmartFieldCode): string | undefined {
        return presUfKey(this.run.info, code);
    }

    /** Значение по фактическому camel-ключу поля; пусто — пропуск. */
    setUf(
        fields: BxRow,
        code: PresentationSmartFieldCode,
        value: unknown,
    ): void {
        presSetUf(this.run.info, fields, code, value);
    }

    /**
     * Значение enumeration-поля: Bitrix ждёт ЧИСЛОВОЙ id значения, а не код.
     * Код не резолвится (справочник правили руками) — поле пропускается,
     * стадия исход всё равно несёт.
     */
    setEnum(
        fields: BxRow,
        code: PresentationSmartFieldCode,
        itemCode: string,
    ): void {
        const item = (this.run.info.enumItems[code] ?? []).find(
            candidate => candidate.code === itemCode,
        );
        if (!item) return;
        this.setUf(fields, code, item.id);
    }

    /** Анкета «5К»/«Хвост» — снимок на момент отчёта (см. джоб). */
    applySurvey(fields: BxRow): void {
        for (const [code, value] of Object.entries(this.run.job.survey ?? {})) {
            this.setUf(fields, code as PresentationSmartFieldCode, value);
        }
    }

    /**
     * Причина отказа ПОСЛЕ этой презентации — снимок на элемент.
     *
     * Пишется только при закрывающем отчёте: `failReasonCode` контекст
     * отдаёт исключительно на финальном отказе типа «Отказ» (гейт
     * EventReportContext.failReasonCode), поэтому «перенос» и «проведена»
     * сюда ничего не приносят. Незнакомый код справочника (правили руками
     * на портале) молча пропускается — стадия исход всё равно несёт.
     */
    applyFailReason(fields: BxRow): void {
        const itemCode = presentationFailReasonItemCode(
            this.run.job.failReasonCode,
        );
        if (!itemCode) return;
        this.setEnum(fields, 'PRES_FAIL_REASON', itemCode);
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
    applyAnswers(
        fields: BxRow,
        purposes: readonly QuestionnaireAnswerPurpose[],
    ): void {
        const { job, info, tz, itemFields } = this.run;
        const answers = job.answers ?? [];
        if (!answers.length) return;

        if (!itemFields) {
            this.logger.warn(
                `[presentation-flow] ${job.domain}: поля элемента не ` +
                    `прочитаны — ${answers.length} ответ(ов) анкеты не записаны`,
            );
            return;
        }

        const { applied, warnings } = applyQuestionnaireAnswers({
            fields,
            itemFields,
            answers,
            purposes,
            timezone: tz,
            mirrorItemsByKey: buildMirrorItemsByKey(info),
        });
        for (const warning of warnings) {
            this.logger.warn(`[presentation-flow] ${job.domain}: ${warning}`);
        }
        if (applied) {
            this.logger.log(
                `[presentation-flow] ${job.domain}: ответов анкеты в ` +
                    `элемент (${purposes.join('+')}) — ${applied}`,
            );
        }
    }
}
