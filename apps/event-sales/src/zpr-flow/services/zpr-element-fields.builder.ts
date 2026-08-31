import { Logger } from '@nestjs/common';
import {
    ZprSmartFieldCode,
    ZprSmartInfo,
} from '@lib/portal-lib/pbx/pbx-zpr-smart';
import {
    applyQuestionnaireAnswers,
    buildMirrorItemsByKey,
    QuestionnaireAnswerPurpose,
} from '../../shared/questionnaire-answers';
import { BxRow, ZprFlowRun } from '../types/zpr-flow-run.type';

/**
 * ЧИСТО ПОЛЯ элемента ЗПР: адресация UF-ключей и раскладка значений.
 *
 * Ремонтируешь «значение не записалось в поле» / «ответ анкеты не доехал» /
 * «снимок лёг не туда» — идти сюда. Стадии живут в zpr-stage.resolver,
 * связи с сущностями — в zpr-element-links.builder: этот класс не знает ни
 * про воронку, ни про привязки.
 *
 * Знания о Битриксе здесь нет вовсе: билдер только НАПОЛНЯЕТ словарь
 * полей, а пишет его writer. Поэтому он же и самая тестируемая часть
 * потока — правила раскладки проверяются без единого фейка клиента.
 */

/**
 * Фактический camel-ключ поля ЗПР по его коду; `undefined` — поля нет на
 * портале (старая установка смарта), и писать/читать по нему нечего.
 *
 * Функция, а не индексация: при `noImplicitAny: false` опечатка в коде
 * поля молча давала бы `any`; параметр функции проверяется всегда —
 * см. развёрнутое «почему» у zprStageId (zpr-stage.resolver).
 */
export function zprUfKey(
    info: ZprSmartInfo,
    code: ZprSmartFieldCode,
): string | undefined {
    return info.ufKeyByCode[code];
}

/**
 * Значение по фактическому ключу поля; пусто/незаведённое поле — пропуск.
 * Standalone (а не только метод): раскладку полей делает и links-builder,
 * а правила пропуска обязаны быть одними на всех писателей.
 */
export function zprSetUf(
    info: ZprSmartInfo,
    fields: BxRow,
    code: ZprSmartFieldCode,
    value: unknown,
): void {
    if (value === null || value === undefined || value === '') return;
    if (Array.isArray(value) && !value.length) return;
    const key = zprUfKey(info, code);
    if (!key) return;
    fields[key] = value;
}

export class ZprElementFieldsBuilder {
    private readonly logger = new Logger(ZprElementFieldsBuilder.name);

    constructor(private readonly run: ZprFlowRun) {}

    /** Фактический camel-ключ поля смарта на этом портале. */
    ufKey(code: ZprSmartFieldCode): string | undefined {
        return zprUfKey(this.run.info, code);
    }

    /** Значение по фактическому camel-ключу поля; пусто — пропуск. */
    setUf(fields: BxRow, code: ZprSmartFieldCode, value: unknown): void {
        zprSetUf(this.run.info, fields, code, value);
    }

    /**
     * Снимок анкеты по кодам НАШЕГО реестра полей — зеркало
     * презентационного applySurvey.
     *
     * Пишется только в закрывающих ветках (закрытие и спонтанный), как у
     * презентаций: на переносе звонок ещё не состоялся, снимка нет.
     * Состав снимка сегодня никто не собирает (см. ZprSurveySnapshot) —
     * поток готов принять его, как только владелец назовёт состав.
     */
    applySurvey(fields: BxRow): void {
        for (const [code, value] of Object.entries(this.run.job.survey ?? {})) {
            this.setUf(fields, code as ZprSmartFieldCode, value);
        }
    }

    /**
     * Ответы ПОРТАЛЬНОЙ анкеты в элемент — зеркало презентационного
     * applyAnswers (см. комментарий там).
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
                `[zpr-flow] ${job.domain}: поля элемента не прочитаны — ` +
                    `${answers.length} ответ(ов) анкеты не записаны`,
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
            this.logger.warn(`[zpr-flow] ${job.domain}: ${warning}`);
        }
        if (applied) {
            this.logger.log(
                `[zpr-flow] ${job.domain}: ответов анкеты в элемент ` +
                    `(${purposes.join('+')}) — ${applied}`,
            );
        }
    }
}
