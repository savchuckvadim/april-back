import { ETaskPriority } from '@/modules/bitrix/domain/tasks/task';

/**
 * Типы предупреждений по сделке (задачи / уведомления) — совпадают с ключами копий для задач.
 * Стыковка с планом: `buildSmartActWarningTasksFromPlan` в `smart-act-plan-warning-from-plan.util.ts`.
 */
export const SMART_ACT_PLAN_WARNINGS = {
    changed_from: {
        title: '⚠️ Изменено поле "Начало договора"',
        description:
            'Изменено поле "Начало договора". Проверьте сделку и акты.',
    },
    has_not_from: {
        title: '⚠️ Нет поля "Начало договора"',
        description: 'Нет поля "Начало договора". Проверьте сделку и акты.',
    },
    has_not_to: {
        title: '⚠️ Нет поля "Конец договора"',
        description: 'Нет поля "Конец договора". Проверьте сделку и акты.',
    },
    has_not_product: {
        title: '❌ Товары в сделке отсутствуют',
        description: 'В сделке нет товарных строк. Проверьте сделку и акты.',
    },
    has_not_company: {
        title: '❌ Нет компании в сделке',
        description:
            'Нет компании в сделке. Проверьте сделку. Привяжите компанию или удалите сделку.',
    },
} as const;

export type SmartActPlanWarningKind = keyof typeof SMART_ACT_PLAN_WARNINGS;

/** Данные для постановки одной задачи-предупреждения (совпадает с полями плана: dealId, companyId). */
export interface ISmartActWarningTaskSendData {
    type: SmartActPlanWarningKind;
    dealId: number;
    companyId: number;
    responsibleId: number;
}

/** COMPANY_ID из CRM → число; пусто / не число → 0. */
export function parseDealCompanyId(
    raw: string | number | null | undefined,
): number {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

export const TASK_PRIORITY = ETaskPriority.MEDIUM;

export const TASK_DEADLINE = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 дней с момента создания задачи
// export const CREATED_BY = '187';
