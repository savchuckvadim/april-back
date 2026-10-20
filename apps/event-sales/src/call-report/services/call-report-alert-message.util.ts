import {
    CALL_REPORT_CALL_TYPE_ITEMS,
    CALL_REPORT_COACHING_ITEMS,
    CALL_REPORT_RISK_FLAG_ITEMS,
    CallReportCoachingCode,
    CallReportRiskFlagCode,
} from '@lib/call-lib';
import { AgentCallAnalysisDto } from '../../agent-gate/dto/agent-analysis-request.dto';

/**
 * Риск-флаги, по которым РОП получает уведомление В ДЕНЬ ЗВОНКА (решение
 * владельца 19.10.2026 — флаги понижены в приоритете): только конфликт /
 * грубость менеджера и нарушение регламента. «Не оставил дверь открытой»
 * в тот же день не шлётся — идёт в повестку недели; обещание и негатив
 * клиента отменены совсем (этап 2 плана ai/tasks/2026-10-19-ai-focus-plan.md)
 * и в разбор не попадают.
 */
export const CALL_REPORT_SAME_DAY_ALERT_FLAGS = [
    'conflict',
    'compliance',
] as const satisfies readonly CallReportRiskFlagCode[];
export type CallReportSameDayAlertFlag =
    (typeof CALL_REPORT_SAME_DAY_ALERT_FLAGS)[number];

/** Вид алерта: риск-флаг дня либо срочный приоритет коучинга. */
export type CallReportAlertKind = CallReportSameDayAlertFlag | 'urgent';

/** Срочный приоритет разбора — сам по себе повод для алерта. */
const URGENT_COACHING: CallReportCoachingCode = 'urgent';

/** Цитата в уведомлении обрезается, чтобы колокольчик остался читаемым. */
export const ALERT_QUOTE_MAX_LENGTH = 300;

/** Что нужно от разбора, чтобы решить об алерте и подобрать цитату. */
type AlertAnalysisView = Pick<
    AgentCallAnalysisDto,
    'riskFlags' | 'coachingPriority' | 'objections' | 'sections'
>;

/** Данные для текста уведомления. */
export interface CallReportAlertMessageInput {
    managerName: string;
    callType: string | null;
    kind: CallReportAlertKind;
    quote: string | null;
    link: string | null;
}

const isSameDayFlag = (code: string): code is CallReportSameDayAlertFlag =>
    (CALL_REPORT_SAME_DAY_ALERT_FLAGS as readonly string[]).includes(code);

/**
 * Вид алерта по разбору: первый риск-флаг ДНЯ (conflict / compliance) в
 * порядке, как их поставил разбор; иначе срочный приоритет коучинга;
 * иначе null — алерт не нужен. Прочие коды (door_closed и отменённые в
 * старых данных) уведомление в день звонка не дают.
 */
export function resolveAlertKind(
    analysis: AlertAnalysisView,
): CallReportAlertKind | null {
    const flag = (analysis.riskFlags ?? []).find(isSameDayFlag);
    if (flag) return flag;
    return analysis.coachingPriority === URGENT_COACHING ? 'urgent' : null;
}

/**
 * Цитата-доказательство: первое возражение с дословной цитатой, иначе
 * «как было» худшего актуального раздела (relevance > 0, минимальный
 * score). До ALERT_QUOTE_MAX_LENGTH символов.
 */
export function pickAlertQuote(analysis: AlertAnalysisView): string | null {
    const objectionQuote = (analysis.objections ?? [])
        .map(objection => objection.quote?.trim() ?? '')
        .find(quote => quote.length > 0);
    if (objectionQuote) return truncateQuote(objectionQuote);

    const worstSection = (analysis.sections ?? [])
        .filter(section => section.relevance > 0 && section.asWas?.trim())
        .sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity))[0];
    const asWas = worstSection?.asWas?.trim();
    return asWas ? truncateQuote(asWas) : null;
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
    const lines = [
        '[B]AI-разбор звонка: сигнал руководителю[/B]',
        `Менеджер: ${input.managerName}`,
        `Тип звонка: ${callTypeTitle(input.callType)}`,
        `Сигнал: ${alertKindTitle(input.kind)}`,
        input.quote ? `Цитата: «${input.quote}»` : null,
        input.link ? `Разбор: ${input.link}` : null,
    ];
    return lines.filter((line): line is string => line !== null).join('\n');
}

/** Подпись вида алерта из справочников смарта. */
export function alertKindTitle(kind: CallReportAlertKind): string {
    if (kind === 'urgent') {
        return (
            CALL_REPORT_COACHING_ITEMS.find(
                item => item.CODE === URGENT_COACHING,
            )?.VALUE ?? kind
        );
    }
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
