import { CallReportCallTypeCode } from '@lib/call-lib';

/** Ожидаемый тип звонка по данным CRM — до какого-либо LLM. */
export interface CallTypePrior {
    callType: CallReportCallTypeCode;
    /**
     * strong — воронка/стадия однозначно задают этап (сделка на стадии
     * «Презентация», «Доработка»); weak — стадия только подсказывает
     * (новая сделка может быть и холодным выходом, и договорённостью о показе).
     */
    strength: 'strong' | 'weak';
    /** Почему так решили — уходит в подсказку модели и в лог. */
    reason: string;
}

/** Входные факты для приора (подмножество паспорта звонка). */
export interface CallTypePriorInput {
    entityType: 'deal' | 'lead' | null;
    /** pbx-код воронки сделки (sales_base / sales_presentation / sales_xo). */
    dealCategoryCode: string | null;
    /** pbx-код стадии сделки (sales_pres, sales_refine, …). */
    dealStageCode: string | null;
    /** Вид работы лида: request — заявка с сайта, lead — обращение, cold. */
    leadWorkKind: 'request' | 'lead' | 'cold' | null;
}

/**
 * Стадия основной воронки → этап разговора. Ключи — pbx-коды стадий
 * (PBX_DEAL_SALES_BASE_STAGES); сила приора отражает, насколько стадия
 * фиксирует содержание звонка.
 */
const BASE_STAGE_PRIORS: Record<
    string,
    { callType: CallReportCallTypeCode; strength: 'strong' | 'weak' }
> = {
    sales_new: { callType: 'call', strength: 'weak' },
    sales_cold: { callType: 'cold', strength: 'weak' },
    sales_warm: { callType: 'call', strength: 'weak' },
    sales_pres: { callType: 'presentation', strength: 'strong' },
    sales_refine: { callType: 'refine', strength: 'strong' },
    sales_offer_create: { callType: 'decision', strength: 'weak' },
    sales_document_send: { callType: 'decision', strength: 'weak' },
    sales_in_progress: { callType: 'payment', strength: 'weak' },
    sales_money_await: { callType: 'payment', strength: 'strong' },
    sales_supply: { callType: 'payment', strength: 'weak' },
};

/** Стадия воронки презентаций → этап разговора. */
const PRESENTATION_STAGE_PRIORS: Record<
    string,
    { callType: CallReportCallTypeCode; strength: 'strong' | 'weak' }
> = {
    sales_presentation_new: { callType: 'call', strength: 'weak' },
    sales_presentation_warm: { callType: 'call', strength: 'weak' },
    sales_presentation_presentation: {
        callType: 'presentation',
        strength: 'strong',
    },
    sales_presentation_document_send: {
        callType: 'decision',
        strength: 'weak',
    },
    sales_presentation_in_progress: { callType: 'decision', strength: 'weak' },
    sales_presentation_money_await: { callType: 'payment', strength: 'strong' },
};

/**
 * Приор типа звонка из CRM — детерминированная подсказка классификатору.
 *
 * ЗАЧЕМ (прод 05.09.2026: массовое «Другое» на тестовых порталах): модель
 * классифицирует по тексту, а в CRM уже написано, на каком этапе сделка.
 * Сделка на стадии «Презентация» почти наверняка даёт презентационный
 * звонок, лид из заявки с сайта — звонок по заявке. Приор не заменяет
 * модель: он подсказывает ей и подстраховывает при неуверенном ответе.
 *
 * null — CRM ничего не говорит (нет владельца, незнакомая стадия).
 */
export function resolveCallTypePrior(
    input: CallTypePriorInput,
): CallTypePrior | null {
    if (input.entityType === 'lead') {
        if (input.leadWorkKind === 'request') {
            return {
                callType: 'site_lead',
                strength: 'strong',
                reason: 'лид создан входящей заявкой с сайта',
            };
        }
        return {
            callType: 'cold',
            strength: 'weak',
            reason:
                input.leadWorkKind === 'lead'
                    ? 'лид из входящего обращения — первый контакт менеджера'
                    : 'звонок по лиду — первый контакт с компанией',
        };
    }
    if (input.entityType !== 'deal' || !input.dealStageCode) return null;

    const table =
        input.dealCategoryCode === 'sales_presentation'
            ? PRESENTATION_STAGE_PRIORS
            : input.dealCategoryCode === 'sales_base' ||
                input.dealCategoryCode === null
              ? BASE_STAGE_PRIORS
              : null;
    const prior = table?.[input.dealStageCode];
    if (!prior) return null;
    return {
        ...prior,
        reason:
            `сделка на стадии ${input.dealStageCode}` +
            (input.dealCategoryCode
                ? ` воронки ${input.dealCategoryCode}`
                : ''),
    };
}

/** Строка для промпта классификатора — подсказка, не приговор. */
export function renderCallTypePrior(prior: CallTypePrior | null): string {
    if (!prior) return '';
    const weight =
        prior.strength === 'strong'
            ? 'отклоняйся от него ТОЛЬКО при явных признаках другого типа в разговоре'
            : 'это слабая подсказка: содержание разговора важнее';
    return (
        `\n\nОЖИДАЕМЫЙ ТИП ПО CRM: '${prior.callType}' (${prior.reason}) — ${weight}. ` +
        `Тип 'other' для такого звонка — почти всегда ошибка: если разговор ` +
        `состоялся и он про продукт, выбери ближайший этап.`
    );
}
