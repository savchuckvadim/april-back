import { CallReportCallTypeCode } from '@lib/call-lib';
import {
    PBX_DEAL_SALES_BASE_STAGE_CODE,
    PbxDealSalesBaseStageCode,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';

/** Коды воронок как строки — сравнение с pbx-кодом паспорта (не magic string). */
const CATEGORY_CODE_BASE: string = PbxDealCategoryCodeEnum.sales_base;
const CATEGORY_CODE_PRESENTATION: string =
    PbxDealCategoryCodeEnum.sales_presentation;

/** Ожидаемый тип звонка для одной стадии. */
interface StagePrior {
    callType: CallReportCallTypeCode;
    strength: 'strong' | 'weak';
}

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
 * (PBX_DEAL_SALES_BASE_STAGE_CODE, никаких строк-литералов); сила приора
 * отражает, насколько стадия фиксирует содержание звонка.
 *
 * ФИНАЛЫ ЗАПОЛНЕНЫ ОБЯЗАТЕЛЬНО (прод 08.09.2026): по закрытой сделке приора
 * не было вовсе, и классификатор скатывался в «Другое» — а звонок по
 * отказной сделке остаётся рабочим разговором. Тип Record<…> по лестнице
 * стадий: забытая стадия — ошибка компиляции, а не тихая дыра.
 */
const BASE_STAGE_PRIORS: Record<PbxDealSalesBaseStageCode, StagePrior> = {
    [PBX_DEAL_SALES_BASE_STAGE_CODE.new]: {
        callType: 'call',
        strength: 'weak',
    },
    [PBX_DEAL_SALES_BASE_STAGE_CODE.cold]: {
        callType: 'cold',
        strength: 'weak',
    },
    [PBX_DEAL_SALES_BASE_STAGE_CODE.warm]: {
        callType: 'call',
        strength: 'weak',
    },
    [PBX_DEAL_SALES_BASE_STAGE_CODE.presentation]: {
        callType: 'presentation',
        strength: 'strong',
    },
    [PBX_DEAL_SALES_BASE_STAGE_CODE.refine]: {
        callType: 'refine',
        strength: 'strong',
    },
    [PBX_DEAL_SALES_BASE_STAGE_CODE.offerCreate]: {
        callType: 'decision',
        strength: 'weak',
    },
    [PBX_DEAL_SALES_BASE_STAGE_CODE.documentSend]: {
        callType: 'decision',
        strength: 'weak',
    },
    [PBX_DEAL_SALES_BASE_STAGE_CODE.inProgress]: {
        callType: 'payment',
        strength: 'weak',
    },
    [PBX_DEAL_SALES_BASE_STAGE_CODE.moneyAwait]: {
        callType: 'payment',
        strength: 'strong',
    },
    [PBX_DEAL_SALES_BASE_STAGE_CODE.supply]: {
        callType: 'payment',
        strength: 'weak',
    },
    // Финалы. Сделка закрыта — разговор уже состоялся, и «Другое» для него
    // почти всегда ошибка. Приоры СЛАБЫЕ: закрытая стадия говорит об исходе
    // сделки, а не о содержании конкретного звонка.
    [PBX_DEAL_SALES_BASE_STAGE_CODE.success]: {
        callType: 'payment',
        strength: 'weak',
    },
    [PBX_DEAL_SALES_BASE_STAGE_CODE.fail]: {
        callType: 'decision',
        strength: 'weak',
    },
    /** «Не состоялась» — сорвавшийся контакт, но рабочий звонок. */
    [PBX_DEAL_SALES_BASE_STAGE_CODE.apology]: {
        callType: 'call',
        strength: 'weak',
    },
    /** «Не ЦА» — отсев на квалификации, ранний контакт. */
    [PBX_DEAL_SALES_BASE_STAGE_CODE.notCa]: {
        callType: 'call',
        strength: 'weak',
    },
};

/** Стадия воронки презентаций → этап разговора. */
const PRESENTATION_STAGE_PRIORS: Record<string, StagePrior> = {
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

    const table: Readonly<Record<string, StagePrior>> | null =
        input.dealCategoryCode === CATEGORY_CODE_PRESENTATION
            ? PRESENTATION_STAGE_PRIORS
            : input.dealCategoryCode === CATEGORY_CODE_BASE ||
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
