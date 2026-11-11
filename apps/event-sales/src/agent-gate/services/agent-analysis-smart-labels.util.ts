import {
    CALL_REPORT_OBJECTION_REACTIONS,
    type CallReportObjectionReaction,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';

/**
 * Служебные коды → русские подписи для полей карточки «AI-анализ звонков».
 * Владелец 10.11.2026 видел в карточке английские коды: «→ clarify» в
 * отработке возражений, «call-report-analyzer» и «internal-focus-v2» в
 * полях агента. В записи разбора (ais) коды остаются как есть — переводится
 * только то, что видит человек в Битриксе.
 */

/** Реакция менеджера на возражение — как в описании поля DTO. */
export const OBJECTION_REACTION_TITLES: Readonly<
    Record<CallReportObjectionReaction, string>
> = {
    answer: 'ответил по существу',
    clarify: 'уточнил вопросом',
    other: 'иное или не отреагировал',
};

const isReaction = (value: string): value is CallReportObjectionReaction =>
    (CALL_REPORT_OBJECTION_REACTIONS as readonly string[]).includes(value);

/**
 * «Как отработал» — свободный текст, но модель иногда кладёт туда код
 * реакции. Код заменяется подписью, обычный текст остаётся как есть.
 */
export function objectionHandlingText(handling: string): string {
    const value = handling.trim();
    return isReaction(value) ? OBJECTION_REACTION_TITLES[value] : value;
}

/** Внутренние исполнители разбора — подписи для поля «Имя агента-аналитика». */
const AGENT_NAME_TITLES: Readonly<Record<string, string>> = {
    'call-report-analyzer': 'April: разбор звонка',
    'call-report-reanalyzer': 'April: переразбор',
};

/** Имя агента для карточки; внешний агент (OpenClaw и др.) — как назвался. */
export function agentNameTitle(name: string | undefined): string | undefined {
    if (!name) return name;
    return AGENT_NAME_TITLES[name] ?? name;
}

/** «internal-focus-v2» → «многослойный разбор, версия 2». */
const INTERNAL_FOCUS_VERSION = /^internal-focus-v(\d+)$/;

/** Версия разбора для карточки; незнакомая — как есть. */
export function agentVersionTitle(
    version: string | undefined,
): string | undefined {
    if (!version) return version;
    const focus = INTERNAL_FOCUS_VERSION.exec(version);
    return focus ? `многослойный разбор, версия ${focus[1]}` : version;
}
