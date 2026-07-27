/**
 * Плановые user-поля (истинная типизация portal-lib) → Field для
 * инсталл-сервиса. Используется pbx-install (полная инсталляция портала)
 * и kpi-report-sales (установка находу перед первым сохранением планов).
 */
import {
    PBX_SALES_USER_PLAN_FIELDS,
    PbxSalesUserPlanField,
} from '@lib/portal-lib/pbx-domain/field/type/sales/user/pbx-sales-user-plan-field.type';
import { Field } from './types/install-field.type';
import { USER_FIELD_PREFIX } from './bx-user-fields-install.service';

/** appType плановых полей (маркировка в конфигах инсталляции). */
export const PLAN_FIELD_APP_TYPE = 'sales_plan';

/** Одно плановое поле → описание для инсталл-сервиса. */
export const planFieldToInstallField = (
    planField: PbxSalesUserPlanField,
): Field => ({
    name: planField.name,
    appType: PLAN_FIELD_APP_TYPE,
    type: planField.type,
    list: [],
    // Код инсталляции с префиксом plan_ — уникальный XML_ID/cmd среди
    // остальных user-полей портала.
    code: `plan_${planField.code}`,
    bxFieldName: planField.user,
    order: planField.order,
    isNeedUpdate: true,
    isMultiple: false,
});

/** Все плановые поля как Field[] (для USER_FIELDS и ensureInstalled). */
export const buildPlanInstallFields = (): Field[] =>
    PBX_SALES_USER_PLAN_FIELDS.map(planFieldToInstallField);

/** Полное имя Bitrix-поля плана: UF_USR_ + суффикс из типизации. */
export const planUserFieldName = (planField: PbxSalesUserPlanField): string =>
    `${USER_FIELD_PREFIX}${planField.user}`;
