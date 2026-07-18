import {
    SmartGroupEnum,
    SmartNameEnum,
} from '../../smart/dto/install-smart.dto';
import {
    ParseEntityFieldsAppName,
    PbxEntityGroupEnum,
} from '../../shared/entity/field/parse-entity-field.service';
import { ListFolderEnum, ListGroupEnum } from '../../list/type/parse.type';
import { PbxCallingGroupEnum } from '@lib/portal-lib/pbx/app-type';

/**
 * Эталонный состав provisioning pbx-сущностей маркетплейс-продукта.
 *
 * Порядок элементов массива = порядок установки. Каждый шаг соответствует
 * существующему install-use-case-у pbx-install (маппинг — в
 * {@link ../services/provision-step.executor.ts ProvisionStepExecutor}).
 */

/** Вид шага provisioning (определяет целевой use-case) */
export enum ProvisionStepKind {
    /** Смарт-процесс целиком (тип + поля + воронки/стадии) */
    SMART = 'smart',
    /** RPA-процесс (запрещён тарифом маркетплейса — только skipped) */
    RPA = 'rpa',
    /** Поля сделки из Excel-шаблона */
    DEAL_FIELDS = 'deal_fields',
    /** Воронки и стадии сделки из Excel-шаблона */
    DEAL_CATEGORIES = 'deal_categories',
    /** Поля компании из Excel-шаблона */
    COMPANY_FIELDS = 'company_fields',
    /** Поля контакта из Excel-шаблона */
    CONTACT_FIELDS = 'contact_fields',
    /** Поля лида из Excel-шаблона */
    LEAD_FIELDS = 'lead_fields',
    /** Универсальный список (инфоблок + поля) из Excel-шаблона */
    LIST = 'list',
    /** Отдел (departaments): требует bitrixId существующего отдела */
    DEPARTAMENT = 'departament',
    /** Рабочая группа звонков (sonet_group) */
    GROUP = 'group',
    /** Реквизиты: пресеты и поля из TS-эталона */
    RQ = 'rq',
    /** Поля пользователя из констант */
    USER_FIELDS = 'user_fields',
    /** Поля задачи из констант */
    TASK_FIELDS = 'task_fields',
    /** Конструктор: синхронизация портальных единиц измерения */
    MEASURES = 'measures',
}

/** Один шаг provisioning продукта */
export interface ProvisionStep {
    kind: ProvisionStepKind;
    /** component_code в marketplace_install_components, напр. 'smart:cold' */
    componentCode: string;
    /** Человекочитаемое название шага (для error_detail/логов) */
    title: string;
    /** Параметры для use-case (smartName, group, listCode и т.п.) */
    params: Record<string, string>;
    /** RPA запрещены тарифом маркетплейса: не выполнять, статус skipped */
    skippedByTariff?: boolean;
}

/**
 * Состав provisioning продукта sales (порядок = порядок установки).
 *
 * НЕ включено (и почему):
 * - departament (ОП): установка требует `bitrixId` существующего отдела в
 *   структуре Bitrix — его выбирает администратор портала, автозначения нет.
 *   TODO(владелец): решить, как получать id отдела при автоматической установке.
 * - konstructor contract/portal-contract: создание записи требует ссылок
 *   contract_id / portal_measure_id / bitrixfield_item_id — сложный вход,
 *   не ставится по одному domain. TODO(владелец): подтвердить состав.
 * - konstructor counter/field/template-base: глобальные CRUD-справочники
 *   (без domain) — на портал ничего не устанавливают.
 */
export const SALES_PROVISION_STEPS: readonly ProvisionStep[] = [
    {
        kind: ProvisionStepKind.GROUP,
        componentCode: 'group:sales',
        title: 'Группа звонков ОП',
        params: { group: PbxCallingGroupEnum.sales },
    },
    {
        kind: ProvisionStepKind.DEAL_FIELDS,
        componentCode: 'deal_fields:sales',
        title: 'Поля сделки (sales)',
        // TODO(владелец): подтвердить appName (all = event + konstructor)
        params: {
            group: PbxEntityGroupEnum.SALES,
            appName: ParseEntityFieldsAppName.ALL,
        },
    },
    {
        kind: ProvisionStepKind.DEAL_CATEGORIES,
        componentCode: 'deal_categories:sales',
        title: 'Воронки и стадии сделки (sales)',
        // categoryName=all — все воронки шаблона install/sales/deal
        params: { group: PbxEntityGroupEnum.SALES, categoryName: 'all' },
    },
    {
        kind: ProvisionStepKind.COMPANY_FIELDS,
        componentCode: 'company_fields:sales',
        title: 'Поля компании (sales)',
        params: {
            group: PbxEntityGroupEnum.SALES,
            appName: ParseEntityFieldsAppName.ALL,
        },
    },
    {
        kind: ProvisionStepKind.CONTACT_FIELDS,
        componentCode: 'contact_fields:sales',
        title: 'Поля контакта (sales)',
        params: {
            group: PbxEntityGroupEnum.SALES,
            appName: ParseEntityFieldsAppName.ALL,
        },
    },
    {
        kind: ProvisionStepKind.LEAD_FIELDS,
        componentCode: 'lead_fields:sales',
        title: 'Поля лида (sales)',
        params: {
            group: PbxEntityGroupEnum.SALES,
            appName: ParseEntityFieldsAppName.ALL,
        },
    },
    {
        kind: ProvisionStepKind.USER_FIELDS,
        componentCode: 'user_fields',
        title: 'Поля пользователя',
        params: {},
    },
    {
        kind: ProvisionStepKind.TASK_FIELDS,
        componentCode: 'task_fields',
        title: 'Поля задачи',
        params: {},
    },
    {
        kind: ProvisionStepKind.LIST,
        componentCode: 'list:kpi',
        title: 'Список KPI',
        params: { listName: ListFolderEnum.KPI, group: ListGroupEnum.SALES },
    },
    {
        kind: ProvisionStepKind.LIST,
        componentCode: 'list:history',
        title: 'Список История',
        params: {
            listName: ListFolderEnum.HISTORY,
            group: ListGroupEnum.SALES,
        },
    },
    {
        kind: ProvisionStepKind.LIST,
        componentCode: 'list:presentation',
        title: 'Список Презентация',
        // шаблон презентационного списка лежит в general-папке
        params: {
            listName: ListFolderEnum.PRESENTATION,
            group: ListGroupEnum.GENERAL,
        },
    },
    {
        kind: ProvisionStepKind.SMART,
        componentCode: 'smart:cold',
        title: 'Смарт-процесс Холодные звонки',
        params: {
            smartName: SmartNameEnum.COLD,
            group: SmartGroupEnum.SALES,
        },
    },
    {
        kind: ProvisionStepKind.SMART,
        componentCode: 'smart:presentation',
        title: 'Смарт-процесс Презентация',
        params: {
            smartName: SmartNameEnum.PRESENTATION,
            group: SmartGroupEnum.SALES,
        },
    },
    {
        kind: ProvisionStepKind.RPA,
        componentCode: 'rpa:sales',
        title: 'RPA-процессы (sales)',
        params: {},
        // RPA недоступны на тарифе маркетплейса — шаг фиксируется как skipped
        skippedByTariff: true,
    },
    {
        kind: ProvisionStepKind.RQ,
        componentCode: 'rq',
        title: 'Реквизиты (пресеты и поля)',
        params: {},
    },
    {
        kind: ProvisionStepKind.MEASURES,
        componentCode: 'konstructor:measures',
        title: 'Единицы измерения конструктора',
        params: {},
    },
];

/** Манифесты provisioning по коду продукта (portal_products.code) */
export const PRODUCT_PROVISION_MANIFESTS: Readonly<
    Record<string, readonly ProvisionStep[]>
> = {
    sales: SALES_PROVISION_STEPS,
};
