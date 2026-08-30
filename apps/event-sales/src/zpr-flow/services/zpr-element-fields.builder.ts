import { Logger } from '@nestjs/common';
import {
    ZprSmartFieldCode,
    ZprSmartInfo,
    ZprSmartStageCode,
} from '@lib/portal-lib/pbx/pbx-zpr-smart';
import {
    applyQuestionnaireAnswers,
    buildMirrorItemsByKey,
    QuestionnaireAnswerPurpose,
} from '../../shared/questionnaire-answers';
import { BxRow, ZprFlowRun } from '../types/zpr-flow-run.type';

/**
 * Поля элемента ЗПР для ОДНОГО прогона джоба.
 *
 * Собран вокруг {@link ZprFlowRun}, а не вокруг голого `info`: каждому
 * второму правилу нужны ещё и job (связи, снимок анкеты), и таймзона
 * (даты ответов), и живые поля элемента — раньше всё это ездило
 * позиционными аргументами через полдесятка приватных методов одного
 * большого сервиса.
 *
 * Знания о Битриксе здесь нет вовсе: билдер только НАПОЛНЯЕТ словарь
 * полей, а пишет его writer. Поэтому он же и самая тестируемая часть
 * потока — правила раскладки проверяются без единого фейка клиента.
 */
export class ZprElementFieldsBuilder {
    private readonly logger = new Logger(ZprElementFieldsBuilder.name);

    constructor(private readonly run: ZprFlowRun) {}

    /**
     * Фактический camel-ключ поля смарта на этом портале; пусто — поля нет
     * (старая установка смарта), и писать/читать по нему нечего.
     */
    ufKey(code: ZprSmartFieldCode): string | undefined {
        return this.run.info.ufKeyByCode[code];
    }

    /** Полный stageId стадии; пусто — стадии нет на портале. */
    stageId(code: ZprSmartStageCode): string | undefined {
        return zprStageId(this.run.info, code);
    }

    /** Значение по фактическому camel-ключу поля; пусто — пропуск. */
    setUf(fields: BxRow, code: ZprSmartFieldCode, value: unknown): void {
        if (value === null || value === undefined || value === '') return;
        if (Array.isArray(value) && !value.length) return;
        const key = this.ufKey(code);
        if (!key) return;
        fields[key] = value;
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
    applyParents(fields: BxRow): void {
        const { job } = this.run;
        if (job.baseDealId) fields['parentId2'] = job.baseDealId;
        if (job.companyId) fields['parentId4'] = job.companyId;
        if (job.leadId) fields['parentId1'] = job.leadId;
        if (job.contactId) fields['parentId3'] = job.contactId;
    }

    /** Связи элемента с сущностями клиента (формат СКАП-writer'а). */
    applyLinks(fields: BxRow): void {
        const { job } = this.run;
        if (job.baseDealId) {
            this.setUf(fields, 'ZPR_BASE_DEAL', [`D_${job.baseDealId}`]);
        }
        if (job.presDealId) {
            this.setUf(fields, 'ZPR_PRES_DEAL', [`D_${job.presDealId}`]);
        }
        if (job.companyId) {
            this.setUf(fields, 'ZPR_COMPANY', [`CO_${job.companyId}`]);
        }
        if (job.leadId) {
            this.setUf(fields, 'ZPR_LEAD', [`L_${job.leadId}`]);
        }
        if (job.contactId) {
            this.setUf(fields, 'ZPR_CONTACT', [`C_${job.contactId}`]);
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
    applySurvey(fields: BxRow): void {
        for (const [code, value] of Object.entries(this.run.job.survey ?? {})) {
            this.setUf(fields, code as ZprSmartFieldCode, value);
        }
    }

    /**
     * Ответы ПОРТАЛЬНОЙ анкеты в элемент — зеркало
     * PresentationFlowService.applyAnswers (см. комментарий там).
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
     *
     * `undefined` — целевой стадии на портале нет вовсе (смарт установлен
     * не полностью). Раньше тип обещал `string` и в Битрикс уезжал
     * `stageId: undefined`; теперь это видно вызывающему, и он пишет отчёт
     * БЕЗ смены стадии, а не теряет его целиком.
     */
    resolveClosingStage(): string | undefined {
        const { job } = this.run;
        if (!job.isResult) return this.stageId('zpr_noresult');
        if (job.isFail) {
            return (
                this.stageId('zpr_result_fail') ?? this.stageId('zpr_success')
            );
        }
        return this.stageId('zpr_success');
    }
}

/**
 * Полный stageId стадии ЗПР по её коду; `undefined` — стадии нет на портале.
 *
 * ЗАЧЕМ ФУНКЦИЯ, А НЕ ПРЯМАЯ ИНДЕКСАЦИЯ `info.stageIdByCode['zpr_plan']`:
 * в корневом tsconfig стоит `noImplicitAny: false`, и при нём индексация
 * объекта неизвестным строковым ключом НЕ ошибка — TypeScript молча отдаёт
 * `any`. То есть опечатка `stageIdByCode['zpr_pendin']` компилируется и
 * доезжает до рантайма как `undefined`. Параметр функции проверяется
 * всегда, независимо от этого флага, поэтому опечатка здесь — ошибка
 * компиляции, а редактор подсказывает список стадий.
 * Ровно тем же приёмом уже защищены поля — см. {@link
 * ZprElementFieldsBuilder.ufKey}.
 */
export function zprStageId(
    info: ZprSmartInfo,
    code: ZprSmartStageCode,
): string | undefined {
    return info.stageIdByCode[code];
}

/**
 * Фактический camel-ключ поля ЗПР по его коду; `undefined` — поля нет на
 * портале. Та же защита от опечаток, что и у {@link zprStageId} — нужна
 * там, где до билдера не дотянуться (lookup работает с голым `info`).
 */
export function zprUfKey(
    info: ZprSmartInfo,
    code: ZprSmartFieldCode,
): string | undefined {
    return info.ufKeyByCode[code];
}

/**
 * Совпадение значения crm-поля с сущностью. Толерантно к ОБОИМ форматам
 * хранения: `D_100` (мультитипная привязка) и голый `100` (Битрикс может
 * нормализовать одиночно-типизированное поле до id) — канон
 * lead-request-sync доказал, что формат зависит от привязок поля.
 */
export function hasLink(
    raw: unknown,
    prefix: string,
    id: number | string,
): boolean {
    const expected = new Set([`${prefix}_${id}`, String(id)]);
    const values = Array.isArray(raw) ? raw : [raw];
    return values.some(value => expected.has(String(value ?? '')));
}

/** id созданного элемента из ответа `crm.item.add`; иначе null. */
export function itemIdOf(response: unknown): number | null {
    const item = (response as { result?: { item?: { id?: unknown } } })?.result
        ?.item;
    const id = Number(item?.id);
    return Number.isFinite(id) && id > 0 ? id : null;
}
