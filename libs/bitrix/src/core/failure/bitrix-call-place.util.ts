import type {
    CallContext,
    CallEntityType,
} from '@/core/call-context/call-context';
import type { BitrixFailureCallContext } from './bitrix-failure.types';

/**
 * «Где» для тревоги Битрикса: какое приложение, какая операция, ради какой
 * карточки и какого сотрудника шёл запрос. Без этого в шторм 500-х на
 * garant в Telegram шли десятки одинаковых строк «Bitrix API error (batch)».
 */

const ENTITY_LABELS: Record<CallEntityType, string> = {
    deal: 'сделка',
    company: 'компания',
    lead: 'лид',
    contact: 'контакт',
    task: 'задача',
    smart: 'элемент смарт-процесса',
};

/** Предел длины текстовых полей контекста в журнале (meta не резиновая). */
const CONTEXT_TEXT_MAX = 200;

const cut = (text: string): string =>
    text.length > CONTEXT_TEXT_MAX
        ? `${text.slice(0, CONTEXT_TEXT_MAX - 1)}…`
        : text;

/**
 * `event-sales · Отчёт «Звонки» · сделка 26735 · сотрудник 325 · queue:event-sales-flow`
 * — пустые части пропускаются. Source печатается всегда: по нему
 * находится код точки входа, даже когда операция подписана.
 */
export function describeCallPlace(context: CallContext, app: string): string {
    const entity = context.entity
        ? `${ENTITY_LABELS[context.entity.type]} ${context.entity.id}`
        : '';
    const actor = context.actor
        ? `сотрудник ${context.actor.userId}` +
          (context.actor.name ? ` (${context.actor.name})` : '')
        : '';
    return [app, context.operation, entity, actor, context.source]
        .filter((part): part is string => Boolean(part))
        .join(' · ');
}

/** Вторая строка тревоги и остальные — подписанный текст; пустые не печатаются. */
export function signBitrixAlert(
    text: string,
    place: string,
    extraLines: string[] = [],
): string {
    return [text, `Где: ${place}`, ...extraLines.filter(Boolean)].join('\n');
}

/** Снимок контекста для meta журнала — только заполненные поля. */
export function callContextSnapshot(
    context: CallContext,
    app: string,
): BitrixFailureCallContext {
    const snapshot: BitrixFailureCallContext = {
        source: cut(context.source),
        callClass: context.callClass,
        app,
    };
    if (context.operation) snapshot.operation = cut(context.operation);
    if (context.entity) snapshot.entity = { ...context.entity };
    if (context.actor) snapshot.actor = { ...context.actor };
    return snapshot;
}
