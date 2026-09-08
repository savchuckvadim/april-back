/**
 * Константы слепой проверки руководителя «три звонка недели» (план Фазы 2,
 * поток 15 «p2-rop-mark»; постановка — `ai-sales-analytics-plan.md` §12 и
 * §4.11): адресация записей в ais, код и ритм шага конвейера, лимиты
 * метки, русские подписи причин подбора и честная оговорка о слепоте.
 *
 * Файл отдельный от `constants/ai-analytics.const.ts` намеренно (правило
 * владения общими файлами §1.6 п. 3): туда пишет только поток настроек.
 * Магических строк типов записей, причин и ритмов в коде среза нет
 * (ai/rules/pbx-typing.md).
 */
import {
    AI_ANALYTICS_SNAPSHOT_APP,
    AI_ANALYTICS_SNAPSHOT_PROVIDER,
    isoWeekday,
    shiftDate,
} from '@lib/sales-ai-analytics';
import {
    ROP_MARK_WEEK_LIMIT,
    type RopMarkReason,
} from '@lib/sales-ai-analytics/model/rop-mark';
import type { AiPipelineRhythm } from './ai-snapshot.const';

/**
 * Тип и адресация ais-записи подбора недели (план §3.1,
 * `ai-analytics-rop-mark`): ключ записи — ISO-неделя 'YYYY-Www',
 * `user_id` не заполняется (запись портальная, менеджеры — внутри).
 * Своя константа, а не значение реестра снапшотов: реестр принадлежит
 * потоку стора (§1.6 п. 10), а форма записи здесь — собственная, как у
 * `AI_ANALYTICS_SETTINGS_AUDIT_RECORD`.
 */
export const AI_ROP_MARK_RECORD = {
    TYPE: 'ai-analytics-rop-mark',
    APP: AI_ANALYTICS_SNAPSHOT_APP,
    PROVIDER: AI_ANALYTICS_SNAPSHOT_PROVIDER,
} as const;

/** Код шага конвейера и его ритм: подбор делается раз в неделю. */
export const AI_ROP_MARK_STEP_CODE = 'rop-mark' as const;
export const AI_ROP_MARK_STEP_RHYTHMS = [
    'weekly',
] as const satisfies readonly AiPipelineRhythm[];

/** Человеческий бюджет недели — три звонка (план §12, дубль lib-константы). */
export const AI_ROP_MARK_WEEKLY_LIMIT = ROP_MARK_WEEK_LIMIT;

/** Объект записи обратной связи: подбор недели и метка по звонку. */
export const AI_ROP_MARK_OBJECT = {
    week: (weekKey: string): string => `rop-mark:${weekKey}`,
    call: (transcriptionId: string): string => `call:${transcriptionId}`,
} as const;

/** Причины пропуска шага (штатная деградация §5.4). */
export const AI_ROP_MARK_SKIP_REASONS = {
    /** Шина конвейера не дала ни одной строки звонков за неделю. */
    noCalls: 'rop-mark-no-calls',
    /** Строки есть, но ни одна не годится в кандидаты (нет менеджера). */
    noCandidates: 'rop-mark-no-candidates',
} as const;

/** Русские подписи причин подбора — их видит руководитель в витрине. */
export const AI_ROP_MARK_REASON_TITLES: Record<RopMarkReason, string> = {
    uncertain_type: 'Тип звонка определён неуверенно',
    best_score: 'Лучший балл недели (проверка метрики)',
    random: 'Случайный звонок недели',
};

/** Лимиты метки: шкала оценки, длина текстов и число разделов. */
export const AI_ROP_MARK_LIMITS = {
    /** Оценка руководителя — та же шкала 1–10, что у разбора. */
    scoreMin: 1,
    scoreMax: 10,
    /** Разделов рубрики всего семь — больше указать нельзя. */
    sections: 7,
    /** Длина полей «почему так» и «как лучше». */
    text: 2000,
} as const;

/**
 * Честная оговорка о слепом режиме (в DTO и README): мы не отдаём оценку
 * AI до сохранения метки только на СВОЕЙ ручке. Карточку разбора в
 * Битрикс руководитель открыть может, и там оценка видна — техническими
 * средствами это не закрывается, это договорённость.
 */
export const AI_ROP_MARK_BLIND_NOTE =
    'Слепой режим: до сохранения метки оценка AI по звонку не отдаётся ' +
    'этой ручкой. Гарантия действует только здесь — карточку разбора в ' +
    'Битрикс руководитель может открыть и увидеть оценку.';

/** Сообщения отказов ручки (по-русски, как в остальных сценариях среза). */
export const AI_ROP_MARK_MESSAGES = {
    pickMissing:
        'Подбор звонков на эту неделю ещё не сделан — метку ставить не по чему',
    callNotPicked:
        'Звонок не входит в подбор недели: слепая метка ставится только ' +
        'по трём подобранным звонкам',
} as const;

/** Понедельник ISO-недели по её ключу 'YYYY-Www' (4 января всегда в W01). */
export function mondayOfIsoWeek(weekKey: string): string {
    const [year, week] = weekKey.split('-W');
    const anchor = `${year}-01-04`;
    const firstMonday = shiftDate(anchor, -(isoWeekday(anchor) - 1));
    return shiftDate(firstMonday, (Number(week) - 1) * 7);
}

/** Форма ключа недели: 'YYYY-Www'. */
export const AI_ROP_MARK_WEEK_KEY_PATTERN = /^\d{4}-W\d{2}$/;

export function isRopMarkWeekKey(value: string): boolean {
    return AI_ROP_MARK_WEEK_KEY_PATTERN.test(value);
}
