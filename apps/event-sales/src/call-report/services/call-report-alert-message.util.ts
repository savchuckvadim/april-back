import {
    CALL_REPORT_CALL_TYPE_ITEMS,
    CALL_REPORT_RISK_FLAG_ITEMS,
} from '@lib/call-lib';
import type { CallReportActiveRiskFlagCode } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import {
    CALL_MISTAKE_SIGNAL_TITLES,
    isCallMistakeSignalKind,
    ManagerSignal,
    ManagerSignalCallView,
    ManagerSignalKind,
    ManagerSignalQuoteSource,
    resolveManagerSignal,
} from '@lib/sales-ai-analytics';
import { AgentCallAnalysisDto } from '../../agent-gate/dto/agent-analysis-request.dto';

/**
 * Риск-флаги, по которым РОП получает уведомление В ДЕНЬ ЗВОНКА (решение
 * владельца 19.10.2026): только конфликт / грубость менеджера и нарушение
 * регламента, и только с дословной цитатой. «Не оставил дверь открытой»
 * в тот же день не шлётся — идёт в повестку недели.
 */
export const CALL_REPORT_SAME_DAY_ALERT_FLAGS = [
    'conflict',
    'compliance',
] as const satisfies readonly CallReportActiveRiskFlagCode[];
export type CallReportSameDayAlertFlag =
    (typeof CALL_REPORT_SAME_DAY_ALERT_FLAGS)[number];

/** Вид алерта: флаг дня или ошибка менеджера (manager-signal.rules). */
export type CallReportAlertKind = ManagerSignalKind;

/** Цитата в уведомлении обрезается, чтобы колокольчик остался читаемым. */
export const ALERT_QUOTE_MAX_LENGTH = 300;

/** Подпись цитаты: чьи это слова. */
const QUOTE_LABELS: Record<ManagerSignalQuoteSource, string> = {
    evidence: 'Цитата',
    client: 'Возражение клиента',
    manager: 'Как было',
};

/** Данные для текста уведомления. */
export interface CallReportAlertMessageInput {
    managerName: string;
    callType: string | null;
    signal: ManagerSignal;
    link: string | null;
}

/**
 * Сигнал по разбору (решение владельца 11.11.2026): повод — ошибка
 * менеджера, а не возражение клиента. Флаги дня с цитатой, возражение не
 * отработано, показ без потребностей или без «свойство — связка — выгода»;
 * срочный приоритет коучинга сам по себе алерта не даёт. null — алерт не нужен.
 */
export function resolveAlertSignal(
    analysis: AgentCallAnalysisDto,
): ManagerSignal | null {
    return resolveManagerSignal(
        toSignalView(analysis),
        CALL_REPORT_SAME_DAY_ALERT_FLAGS,
    );
}

/** Проекция разбора для правила сигнала: необязательные поля — null. */
export function toSignalView(
    analysis: AgentCallAnalysisDto,
): ManagerSignalCallView {
    return {
        riskFlags: analysis.riskFlags ?? [],
        riskEvidence: (analysis.riskEvidence ?? []).map(item => ({
            flag: item.flag,
            quote: item.quote,
        })),
        objections: (analysis.objections ?? []).map(objection => ({
            quote: objection.quote ?? null,
            handled: objection.handled ?? null,
            outcome: objection.outcome ?? null,
            reaction: objection.reaction ?? null,
        })),
        sections: (analysis.sections ?? []).map(section => ({
            section: section.section,
            relevance: section.relevance,
            score: section.score ?? null,
            asWas: section.asWas ?? null,
        })),
        presentationDone: analysis.presentationDone ?? null,
        needsFound: analysis.needsFound ?? null,
        spiralsFull: analysis.methodology?.spiralsFull ?? null,
    };
}

/**
 * Ссылка на разбор: карточка элемента смарта «AI-анализ звонков» (формат
 * как в недельном отчёте), иначе карточка сделки/лида звонка, иначе null.
 */
export function buildAlertLink(input: {
    domain: string;
    smartEntityTypeId: number | null;
    smartItemId: number | null;
    entityType: string | null;
    entityId: string | null;
}): string | null {
    const { domain, smartEntityTypeId, smartItemId, entityType, entityId } =
        input;
    if (smartItemId && smartEntityTypeId) {
        return `https://${domain}/crm/type/${smartEntityTypeId}/details/${smartItemId}/`;
    }
    const entity = entityType?.toLowerCase() ?? null;
    if (entityId && (entity === 'deal' || entity === 'lead')) {
        return `https://${domain}/crm/${entity}/details/${entityId}/`;
    }
    return null;
}

/** Текст уведомления РОПу (BB-код im.notify.system.add). */
export function buildAlertMessage(input: CallReportAlertMessageInput): string {
    const { signal } = input;
    const lines = [
        '[B]AI-разбор звонка: сигнал руководителю[/B]',
        `Менеджер: ${input.managerName}`,
        `Тип звонка: ${callTypeTitle(input.callType)}`,
        `Сигнал: ${alertKindTitle(signal.kind)}${signal.detail ? ` — ${signal.detail}` : ''}`,
        signal.quote
            ? `${QUOTE_LABELS[signal.quoteSource]}: «${truncateQuote(signal.quote.trim())}»`
            : null,
        input.link ? `Разбор: ${input.link}` : null,
    ];
    return lines.filter((line): line is string => line !== null).join('\n');
}

/** Подпись вида алерта: ошибки менеджера — свои, флаги — из справочника смарта. */
export function alertKindTitle(kind: CallReportAlertKind): string {
    if (isCallMistakeSignalKind(kind)) return CALL_MISTAKE_SIGNAL_TITLES[kind];
    return (
        CALL_REPORT_RISK_FLAG_ITEMS.find(item => item.CODE === kind)?.VALUE ??
        kind
    );
}

/** Название типа звонка: встроенные — из конфига смарта, прочие — код. */
function callTypeTitle(callType: string | null): string {
    if (!callType) return 'не определён';
    return (
        CALL_REPORT_CALL_TYPE_ITEMS.find(item => item.CODE === callType)
            ?.VALUE ?? callType
    );
}

function truncateQuote(text: string): string {
    if (text.length <= ALERT_QUOTE_MAX_LENGTH) return text;
    return `${text.slice(0, ALERT_QUOTE_MAX_LENGTH - 1).trimEnd()}…`;
}
