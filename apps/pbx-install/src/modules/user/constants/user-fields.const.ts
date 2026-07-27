import { Field } from '../../shared/parse-field-excel/type/parse-field.type';
import { buildPlanInstallFields } from '@lib/pbx-user-fields';

/**
 * Пользовательские поля ПОЛЬЗОВАТЕЛЯ для установки в Bitrix.
 *
 * Источник — константы (без Excel). `bxFieldName` указывается без префикса:
 * итоговое имя поля в Bitrix = `UF_USR_` + `bxFieldName`.
 * Так, `EVENT_COMMENT` → `UF_USR_EVENT_COMMENT`.
 *
 * Плановые поля (UF_USR_A_SALES_PLAN_*) — из истинной типизации
 * portal-lib (PBX_SALES_USER_PLAN_FIELDS): полная инсталляция портала
 * ставит их штатно; kpi-report-sales доустанавливает находу при первом
 * сохранении планов тем же buildPlanInstallFields.
 */
export const USER_FIELDS: Field[] = [
    {
        name: 'Комментарий события',
        appType: 'user',
        type: 'string',
        list: [],
        code: 'event_comment',
        bxFieldName: 'EVENT_COMMENT',
        order: 100,
        isNeedUpdate: true,
        isMultiple: false,
    },
    ...buildPlanInstallFields(),
];
