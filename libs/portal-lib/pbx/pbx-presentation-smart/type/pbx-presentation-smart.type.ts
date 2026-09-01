import { PbxSalesEventFieldCode } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';

/**
 * Const-описание смарт-процесса «Презентации» (pres).
 *
 * ЗЕРКАЛО сделок «ОП Презентации» (воронка sales_presentation): один элемент
 * смарта = ОДНА презентация, со стадиями той же формы, связями с основной
 * сделкой/лидом/компанией/контактом, «5К»- и «Хвост»-блоками и историей
 * комментариев. Каркас 1-в-1 с ЗПР (pbx-zpr-smart) — сознательно: следом за
 * ЗПР это второй смарт того же семейства, и различаться им нечем, кроме
 * предметной области.
 *
 * ВАЖНО: сделки «ОП Презентации» продолжают работать как раньше — смарт живёт
 * ПАРАЛЛЕЛЬНО (зеркало), ничего не отключает и не заменяет. Смысл зеркала —
 * подготовить переезд презентаций в смарты: элементы удобнее открывать прямо
 * из родительских сущностей (вкладка в карточке сделки/компании/лида), и
 * отчёт по презентациям строится по одной сущности, а не по воронке сделок.
 *
 * СОСТАВ ШИРЕ ЗЕРКАЛА: кроме сделки-презентации смарт покрывает ещё двух
 * легаси-носителей — список «ОП Презентации» (iblock `sales_presentation`,
 * в april-next он не пишется вовсе) и РПА-процесс «Заявка на презентацию»
 * (`rpa.*` объявлены DEPRECATED целиком). Отсюда стадии согласования и
 * блок полей заявки: цель — одна сущность вместо трёх, без дублей полей
 * одного смысла (карта соответствия — docs/presentation-unification.md §3).
 *
 * Тип НЕ 'presentation': это имя уже занято Excel-шаблоном смарта
 * (SmartNameEnum.PRESENTATION, install/sales/smart/presentation) — const-ветка
 * ParseSmartService матчит шаблоны по паре (type, group) и перехватила бы его.
 * Берём 'pres' — тот же префикс, которым презентации живут в реестре полей
 * (appType: 'pres').
 */

/** Типы полей повторяют PortalFieldType (mapFieldTypeToBitrixType). */
export type PresentationFieldType =
    | 'string'
    | 'integer'
    | 'date'
    | 'datetime'
    | 'boolean'
    | 'enumeration'
    | 'employee'
    | 'crm';

export interface PresentationSmartEnumItem {
    /** Код значения (xmlId в Bitrix). */
    CODE: string;
    VALUE: string;
    SORT: number;
}

export interface PresentationSmartFieldDef {
    /** Код поля: суффикс UF-имени (UF_CRM_{typeId}_{code}) и xmlId. UPPER_SNAKE. */
    code: string;
    name: string;
    type: PresentationFieldType;
    items?: readonly PresentationSmartEnumItem[];
    isMultiple?: boolean;
    /** Для type='crm' — привязка к сущностям (без неё значения молча теряются). */
    crmEntities?: readonly ('LEAD' | 'DEAL' | 'CONTACT' | 'COMPANY')[];
}

export const PRESENTATION_SMART_TYPE = 'pres';
export const PRESENTATION_SMART_GROUP = 'sales';
/** Ключ идемпотентности установки — менять только с переустановкой везде. */
export const PRESENTATION_SMART_CODE = `${PRESENTATION_SMART_TYPE}_${PRESENTATION_SMART_GROUP}`;
export const PRESENTATION_SMART_TITLE = 'Презентации';

// ---------------------------------------------------------------------------
// Стадии: форма воронки sales_presentation (spres_*), коды по конвенции pbx
// ---------------------------------------------------------------------------

/**
 * Стадии: воронка сделок «ОП Презентации»
 * (PbxDealSalesPresentationCategoryType) ПЛЮС контур согласования заявки,
 * который в легаси жил отдельным РПА-процессом «Заявка на презентацию»
 * (`rpa_pres_*`, 7 стадий). Полный жизненный цикл презентации:
 *
 *   заявка → согласование → (отклонена | запланирована) → перенос → исходы
 *
 * ПОЧЕМУ СОГЛАСОВАНИЕ ПЕРЕЕХАЛО СЮДА: методы `rpa.*` в Bitrix24 объявлены
 * DEPRECATED целиком (официальная рекомендация — смарт-процессы), а связи,
 * поля и права у элемента смарта те же. Держать заявку в умирающем РПА, а
 * саму презентацию — в смарте значит вести одну сущность в двух системах.
 *
 * `pres_approve` — ОДНА стадия вместо четырёх РПА-стадий
 * (OWNER/MANAGER/EDU/TECHNIC): ветки согласования на разных порталах разные,
 * и четыре стадии расползлись бы в воронке. «Кто согласует прямо сейчас»
 * несёт поле PRES_APPROVE_STAGE — фильтровать по нему дешевле, чем плодить
 * стадии.
 *
 * `pres_rejected` — легаси-стадия РПА `FAIL` и значение списка
 * `pres_result_init_fail`. Без неё «заявку вернули на доработку»
 * неотличимо от «презентация не состоялась»: и то и другое падало бы в
 * `pres_noresult`, а это разные события с разными виновниками.
 *
 * `pres_new` ОСТАВЛЕНА, хотя сегодня flow создаёт элемент сразу в
 * `pres_plan` (менеджер ОП планирует презентацию сам, без заявки ТМЦ).
 * Причины: (1) это стадия по умолчанию — элемент, заведённый руками из
 * карточки, попадает именно в неё, и findOpenElement обязан его находить;
 * (2) с приходом контура согласования у неё появился смысл входа «заявка
 * подана» (ТМЦ → согласование → план), ради которого она и заводилась;
 * (3) снос стадии на живом портале уносит элементы, которые в ней стоят.
 *
 * «Перенос» (pending) — ОТКРЫТАЯ стадия намеренно: перенесённая презентация
 * остаётся живой и закрывается следующим отчётом, ровно как pres-сделка.
 * Семантика S/F задаётся ЯВНО: эвристика установщика по суффиксу не знает
 * ни NORESULT, ни REJECTED, ни того, что NEW/APPROVE/PLAN/PENDING —
 * промежуточные.
 *
 * ПОРЯДОК: все промежуточные стадии идут ДО закрывающих. Bitrix не любит
 * «промежуточную после успешной» по SORT (см. InstallStageSyncService), и
 * `pres_rejected` при всей своей «ранности» в жизненном цикле стоит в
 * группе исходов, а не между `pres_approve` и `pres_plan`.
 */
export const PRESENTATION_SMART_STAGES = [
    {
        code: 'pres_new',
        name: 'Заявка на презентацию',
        semantics: null,
        sort: 10,
    },
    {
        code: 'pres_approve',
        name: 'На согласовании',
        semantics: null,
        sort: 20,
    },
    { code: 'pres_plan', name: 'Запланирована', semantics: null, sort: 30 },
    {
        code: 'pres_pending',
        name: 'Презентация: Перенос',
        semantics: null,
        sort: 40,
    },
    {
        code: 'pres_success',
        name: 'Презентация проведена',
        semantics: 'S',
        sort: 50,
    },
    {
        code: 'pres_rejected',
        name: 'Заявка отклонена / на доработку',
        semantics: 'F',
        sort: 60,
    },
    {
        code: 'pres_noresult',
        name: 'Презентация не состоялась',
        semantics: 'F',
        sort: 70,
    },
    {
        code: 'pres_fail',
        name: 'Отказ после презентации',
        semantics: 'F',
        sort: 80,
    },
] as const;

export type PresentationSmartStageCode =
    (typeof PRESENTATION_SMART_STAGES)[number]['code'];

/**
 * ОТКРЫТЫЕ стадии — те, у которых нет закрывающей семантики: заявка,
 * согласование, план, перенос. Среди них presentation-flow ищет «живую»
 * презентацию клиента, чтобы отчёт закрыл её, а не завёл дубль.
 *
 * Выводится из PRESENTATION_SMART_STAGES, а не перечисляется руками:
 * иначе добавленная стадия согласования не попала бы в поиск, и каждый
 * отчёт по ждущей согласования заявке плодил бы спонтанный элемент.
 */
export const PRESENTATION_OPEN_STAGE_CODES: readonly PresentationSmartStageCode[] =
    PRESENTATION_SMART_STAGES.filter(stage => stage.semantics === null).map(
        stage => stage.code,
    );

// ---------------------------------------------------------------------------
// Результат презентации — то, что спрашивает отчёт по презентациям
// ---------------------------------------------------------------------------

/**
 * Единый справочник исхода. Стадия и так несёт исход, но фильтровать и
 * группировать отчёт по enum-полю дешевле, чем по stageId с его
 * DT{entityTypeId}_{catId}: префиксом.
 */
export const PRESENTATION_RESULT_ITEMS: readonly PresentationSmartEnumItem[] = [
    { CODE: 'pres_res_done', VALUE: 'Состоялась', SORT: 10 },
    { CODE: 'pres_res_noresult', VALUE: 'Не состоялась', SORT: 20 },
    { CODE: 'pres_res_moved', VALUE: 'Перенесена', SORT: 30 },
    { CODE: 'pres_res_fail', VALUE: 'Отказ после презентации', SORT: 40 },
] as const;

/** Код исхода — чтобы flow не писал сырые строки в enum-поле. */
export const PRESENTATION_RESULT_CODE = {
    done: 'pres_res_done',
    noresult: 'pres_res_noresult',
    moved: 'pres_res_moved',
    fail: 'pres_res_fail',
} as const;

export type PresentationResultCode =
    (typeof PRESENTATION_RESULT_CODE)[keyof typeof PRESENTATION_RESULT_CODE];

// ---------------------------------------------------------------------------
// Согласование заявки — ветка, на которой заявка стоит сейчас
// ---------------------------------------------------------------------------

/**
 * Четыре ветки согласования легаси-РПА (`rpa_pres_owner|manager|edu|technic`)
 * — ЗНАЧЕНИЯМИ поля, а не стадиями воронки: на разных порталах согласуют
 * по-разному, и четыре стадии превратили бы воронку в лестницу, по которой
 * половина порталов не ходит. Стадия одна (`pres_approve`), ветка — здесь.
 */
export const PRESENTATION_APPROVE_STAGE_ITEMS: readonly PresentationSmartEnumItem[] =
    [
        { CODE: 'pres_appr_owner', VALUE: 'Руководитель', SORT: 10 },
        { CODE: 'pres_appr_manager', VALUE: 'Менеджер ОП', SORT: 20 },
        { CODE: 'pres_appr_edu', VALUE: 'Обучение', SORT: 30 },
        { CODE: 'pres_appr_technic', VALUE: 'Тех. поддержка', SORT: 40 },
    ] as const;

// ---------------------------------------------------------------------------
// Причина отказа ПОСЛЕ презентации (снимок на конкретную презентацию)
// ---------------------------------------------------------------------------

/**
 * Зеркало справочника `op_efield_fail_reason` (он же список
 * `sales_presentation_pres_fail_reason`) — те же 11 значений.
 *
 * Зачем копия, если справочник уже есть на клиенте: на лиде/компании/сделке
 * лежит ПОСЛЕДНЯЯ причина отказа клиента, а отчёт «почему отказывают после
 * презентаций» спрашивает причину КОНКРЕТНОЙ презентации. Следующий отказ
 * перезатрёт клиентское поле — снимок в элементе останется.
 *
 * Коды — по конвенции смарта (`pres_fail_*`), а не побуквенное повторение
 * легаси-кодов списка (`pres_c_habit`, `fail_off` — там префиксы разъехались
 * ещё в сиде). Суффикс СОВПАДАЕТ с суффиксом `op_efield_fail_*`, поэтому
 * перевод кода отчёта в код элемента — чистая подстановка префикса
 * ({@link presentationFailReasonItemCode}), а не таблица соответствий.
 */
export const PRESENTATION_FAIL_REASON_ITEMS: readonly PresentationSmartEnumItem[] =
    [
        { CODE: 'pres_fail_notime', VALUE: 'Не было времени', SORT: 10 },
        {
            CODE: 'pres_fail_c_habit',
            VALUE: 'Конкуренты - привыкли',
            SORT: 20,
        },
        {
            CODE: 'pres_fail_c_prepay',
            VALUE: 'Конкуренты - оплачено',
            SORT: 30,
        },
        { CODE: 'pres_fail_c_price', VALUE: 'Конкуренты - цена', SORT: 40 },
        { CODE: 'pres_fail_to_expensive', VALUE: 'Слишком дорого', SORT: 50 },
        { CODE: 'pres_fail_to_cheap', VALUE: 'Слишком дешево', SORT: 60 },
        { CODE: 'pres_fail_nomoney', VALUE: 'Нет денег', SORT: 70 },
        { CODE: 'pres_fail_noneed', VALUE: 'Не видят надобности', SORT: 80 },
        { CODE: 'pres_fail_lpr', VALUE: 'ЛПР против', SORT: 90 },
        {
            CODE: 'pres_fail_employee',
            VALUE: 'Ключевой сотрудник против',
            SORT: 100,
        },
        { CODE: 'pres_fail_off', VALUE: 'Не хотят общаться', SORT: 110 },
    ] as const;

/** Префикс item-кодов {@link PRESENTATION_FAIL_REASON_ITEMS}. */
export const PRESENTATION_FAIL_REASON_PREFIX = 'pres_fail_';

/**
 * Код причины отказа из отчёта (`EventReportContext.failReasonCode`, суффикс
 * вида `notime` / `c_price`) → item-код поля PRES_FAIL_REASON.
 *
 * Незнакомый суффикс (справочник правили руками на портале) даёт `null`:
 * элемент лучше оставить без причины, чем записать в enum значение, которого
 * в поле нет — Битрикс молча проглотит его и отчёт по причинам будет врать.
 */
export function presentationFailReasonItemCode(
    reasonCode: string | null | undefined,
): string | null {
    if (!reasonCode) return null;
    const code = `${PRESENTATION_FAIL_REASON_PREFIX}${reasonCode}`;
    return PRESENTATION_FAIL_REASON_ITEMS.some(item => item.CODE === code)
        ? code
        : null;
}

// ---------------------------------------------------------------------------
// Поля элемента
// ---------------------------------------------------------------------------

/**
 * Поля объявлены `as const satisfies` (а не аннотацией типа): так коды
 * остаются литералами и из них выводится {@link PresentationSmartFieldCode} —
 * запись в несуществующее поле не компилируется.
 */
export const PRESENTATION_SMART_FIELDS = [
    // === Связи (обязательный контур: без них элемент не найти из карточек) ===
    {
        code: 'PRES_BASE_DEAL',
        name: 'Основная сделка',
        type: 'crm',
        crmEntities: ['DEAL'],
    },
    {
        // Пока презентации живут сделками — ссылка на «свою» pres-сделку.
        // После переезда поле останется историей соответствия.
        code: 'PRES_DEAL',
        name: 'Сделка презентации (зеркало)',
        type: 'crm',
        crmEntities: ['DEAL'],
    },
    {
        code: 'PRES_LEAD',
        name: 'Лид/заявка',
        type: 'crm',
        crmEntities: ['LEAD'],
    },
    {
        code: 'PRES_COMPANY',
        name: 'Компания',
        type: 'crm',
        crmEntities: ['COMPANY'],
    },
    {
        code: 'PRES_CONTACT',
        name: 'Контакт презентации',
        type: 'crm',
        crmEntities: ['CONTACT'],
    },
    {
        // Легаси: список `pres_crm_tmc_deal`, РПА `rpa_crm_tmc_deal`. Без
        // этой связи ТМЦ-цепочку по элементу не восстановить: сегодня
        // ТМЦ-сделка ищется обходом (привязки задачи + обратная ссылка
        // UF_CRM_TO_PRESENTATION_SALES на pres-СДЕЛКЕ), а после отказа от
        // pres-сделок этот путь исчезает вместе с ними.
        code: 'PRES_TMC_DEAL',
        name: 'ТМЦ сделка',
        type: 'crm',
        crmEntities: ['DEAL'],
    },
    // «Полностью наш»: хоть одна ЗАЯВКА (лидоген) среди привязок.
    {
        code: 'PRES_IS_OUR_REQUEST',
        name: 'Из заявки (полностью наш)',
        type: 'boolean',
    },

    // === Планирование / исполнение ===
    { code: 'PRES_PLAN_DATE', name: 'Запланирована на', type: 'datetime' },
    { code: 'PRES_DONE_DATE', name: 'Проведена', type: 'datetime' },
    {
        code: 'PRES_IS_SPONTANEOUS',
        name: 'Спонтанная (незапланированная)',
        type: 'boolean',
    },
    // Два ответственных — так же, как на сделке/компании живут
    // last_pres_done_responsible и last_pres_plan_responsible: отчёт считает
    // «назначил» и «провёл» разными людьми (лидоген vs менеджер).
    { code: 'PRES_RESPONSIBLE', name: 'Провёл презентацию', type: 'employee' },
    {
        code: 'PRES_PLAN_RESPONSIBLE',
        name: 'Назначил презентацию',
        type: 'employee',
    },
    {
        code: 'PRES_RESULT',
        name: 'Результат',
        type: 'enumeration',
        items: PRESENTATION_RESULT_ITEMS,
    },
    {
        // Считаем переносы: «сколько раз клиент отодвигал презентацию» —
        // отдельный вопрос отчёта, по стадии его не восстановить.
        code: 'PRES_MOVE_COUNT',
        name: 'Переносов',
        type: 'integer',
    },
    {
        // Легаси-список `pres_pound_date`. Счётчик переносов отвечает
        // «сколько раз», а «когда переносили в последний раз» по нему не
        // восстановить: PRES_NEXT_CALL_DATE хранит дату, НА которую
        // перенесли, а не момент самого переноса.
        code: 'PRES_MOVE_DATE',
        name: 'Дата последнего переноса',
        type: 'datetime',
    },
    {
        // Снимок причины отказа ИМЕННО после этой презентации; на клиенте
        // (op_efield_fail_reason) лежит только последняя по счёту.
        code: 'PRES_FAIL_REASON',
        name: 'Причина отказа после презентации',
        type: 'enumeration',
        items: PRESENTATION_FAIL_REASON_ITEMS,
    },

    // === Заявка и согласование (легаси-контур ТМЦ → РПА → ОП) ===
    // Эти поля заполняет ЧЕЛОВЕК (или робот согласования на портале), а не
    // presentation-flow: в april-next ТМЦ-отчёта и вебхука «заявка
    // утверждена» пока нет (см. §1.7 docs/presentation-unification.md).
    // Смысл — дать заявке дом в смарте, чтобы согласование перестало жить в
    // deprecated-РПА; когда ТМЦ-ветка появится, писать будет куда.
    {
        code: 'PRES_TMC_RESPONSIBLE',
        name: 'ТМЦ: кто подал заявку',
        type: 'employee',
    },
    {
        // РПА `owner_op`: руководитель, который заявку утверждает. Не
        // дубль PRES_PLAN_RESPONSIBLE («назначил презентацию»): назначает
        // ОП после утверждения, утверждает — руководитель до него.
        code: 'PRES_OWNER',
        name: 'Руководитель (утверждает заявку)',
        type: 'employee',
    },
    {
        // Ветка согласования вместо четырёх стадий РПА (см. items).
        code: 'PRES_APPROVE_STAGE',
        name: 'Согласование: чья очередь',
        type: 'enumeration',
        items: PRESENTATION_APPROVE_STAGE_ITEMS,
    },
    {
        // Легаси-список `pres_init_status_date` — момент приёма ИЛИ
        // отклонения заявки (какое из двух — говорит стадия).
        code: 'PRES_APPROVE_DATE',
        name: 'Дата решения по заявке',
        type: 'datetime',
    },
    {
        // Легаси-список `pres_init_comment` / `pres_init_fail_comment`,
        // РПА `rpa_owner_comment`. Отдельным полем, а не строкой в ленте:
        // «за что вернули на доработку» обязано быть фильтруемым.
        code: 'PRES_APPROVE_COMMENT',
        name: 'Комментарий к непринятой заявке',
        type: 'string',
    },
    {
        // Три ветки комментариев к заявке (РПА `rpa_tmc_comment` /
        // `rpa_manager_comment` / `rpa_edu_comment`) сведены в ОДНУ ленту с
        // префиксом ветки: три поля под один и тот же текст — ровно тот
        // дубль, от которого уходим. Не дубль PRES_PLAN_COMMENT: тот —
        // комментарий менеджера ОП при ПЛАНИРОВАНИИ, этот — переписка
        // согласующих до плана.
        code: 'PRES_REQUEST_COMMENT',
        name: 'Комментарии к заявке',
        type: 'string',
        isMultiple: true,
    },
    {
        code: 'PRES_IS_NEED_EDU',
        name: 'Требуется обучение',
        type: 'boolean',
    },
    {
        code: 'PRES_NEED_EDU_DATE',
        name: 'Дата обучения',
        type: 'datetime',
    },
    {
        code: 'PRES_IS_NEED_TECHNIC',
        name: 'Требуется тех. поддержка',
        type: 'boolean',
    },
    {
        code: 'PRES_NEED_TECHNIC_DATE',
        name: 'Дата тех. поддержки',
        type: 'datetime',
    },
    {
        code: 'PRES_NEED_TECHNIC_COMMENT',
        name: 'Комментарий тех. поддержке',
        type: 'string',
    },

    // === «5К»: сводка + девять детальных ответов анкеты ===
    { code: 'PRES_5K_SUMMARY', name: 'Пять К (сводно)', type: 'string' },
    { code: 'PRES_5K_CLIENT_WHAT', name: 'КЛИЕНТ: Что хочет?', type: 'string' },
    {
        code: 'PRES_5K_CLIENT_READY',
        name: 'КЛИЕНТ: Готов работать?',
        type: 'string',
    },
    {
        code: 'PRES_5K_CLIENT_PRICE',
        name: 'КЛИЕНТ: Укладываемся в цену?',
        type: 'string',
    },
    {
        code: 'PRES_5K_COMPANY_WHO',
        name: 'КОМПАНИЯ: Кто принимает решение?',
        type: 'string',
    },
    {
        code: 'PRES_5K_COMPANY_HOW',
        name: 'КОМПАНИЯ: Как принимается решение?',
        type: 'string',
    },
    {
        code: 'PRES_5K_COMPANY_RIGHT',
        name: 'КОМПАНИЯ: Правильно ли подобрали цену и комплект?',
        type: 'string',
    },
    {
        code: 'PRES_5K_COMMAND',
        name: 'КОЛЛЕГИ: Кто будет работать с системой, будут ли обсуждать?',
        type: 'string',
    },
    {
        code: 'PRES_5K_CONCURENT',
        name: 'КОНКУРЕНТ: По каким критериям нас сравнивают?',
        type: 'string',
    },
    {
        code: 'PRES_5K_CRITERI',
        name: 'КРИТЕРИЙ ВЫБОРА: Что важно при выборе СПС?',
        type: 'string',
    },

    // === «Разговор»: шесть обязательных вопросов опросника ===
    // До появления полей op_talk_* эти ответы жили только в тексте
    // комментария: у элемента презентации не было своего снимка разговора.
    {
        code: 'PRES_TALK_IMPRESSION',
        name: 'РАЗГОВОР: Первое впечатление',
        type: 'string',
    },
    {
        code: 'PRES_TALK_REMEMBERED',
        name: 'РАЗГОВОР: Что запомнили',
        type: 'string',
    },
    {
        code: 'PRES_TALK_DESIRE',
        name: 'РАЗГОВОР: Желание работать',
        type: 'string',
    },
    {
        code: 'PRES_TALK_DECISION_PROCESS',
        name: 'РАЗГОВОР: Как принимается решение',
        type: 'string',
    },
    {
        code: 'PRES_TALK_PRICE_OPINION',
        name: 'РАЗГОВОР: Мнение о цене',
        type: 'string',
    },
    {
        code: 'PRES_TALK_BOSS_READINESS',
        name: 'РАЗГОВОР: Готовность подойти к руководителю',
        type: 'string',
    },

    // === «Хвост»: сводка + вопросы «Разговора», выдернутые в фича-поля ===
    { code: 'PRES_XVOST', name: 'Хвост (сводно)', type: 'string' },
    {
        code: 'PRES_DECISION_CALL_DATE',
        name: 'Дата звонка по решению',
        type: 'date',
    },
    {
        code: 'PRES_DECISION_AGREEMENT',
        name: 'Согласование даты по решению',
        type: 'date',
    },
    {
        code: 'PRES_MANAGER_APPROACH_DATE',
        name: 'Дата похода к руководителю',
        type: 'date',
    },
    { code: 'PRES_IS_OFFER', name: 'Предложено КП ?', type: 'boolean' },
    {
        code: 'PRES_IS_COMPLECT',
        name: 'Озвучено наполнение ?',
        type: 'boolean',
    },
    { code: 'PRES_IS_PRICE', name: 'Озвучена цена ?', type: 'boolean' },

    // === История комментариев (план / отчёт / накопительная лента) ===
    {
        code: 'PRES_PLAN_COMMENT',
        name: 'Комментарий планирования',
        type: 'string',
    },
    { code: 'PRES_REPORT_COMMENT', name: 'Комментарий отчёта', type: 'string' },
    {
        code: 'PRES_COMMENTS',
        name: 'История комментариев',
        type: 'string',
        isMultiple: true,
    },

    // === Зеркала дат касания из основной сделки ===
    /*
     * PRES_MHISTORY («История (зеркало сделки)») УДАЛЕНО осознанно.
     *
     * Поле было объявлено, но не писалось НИ ОДНОЙ строкой кода — установщик
     * заводил на портале UF, который в карточке всегда пуст: менеджер видит
     * пустую «Историю» и делает вывод, что история потерялась.
     *
     * Возвращать его как зеркало `op_mhistory` нельзя по правилу «никаких
     * дублей одного смысла»: `op_mhistory` — лента КЛИЕНТА (агрегат по всем
     * событиям, живёт на лиде/компании/сделке), а у элемента уже есть своя
     * лента PRES_COMMENTS — план, отчёт и согласование ИМЕННО этой
     * презентации. Копия клиентской ленты в каждый элемент дала бы третью
     * копию одного текста и заставляла бы читать сделку на каждый джоб.
     *
     * Установщик поля не удаляет: на уже установленных порталах
     * UF_CRM_{typeId}_PRES_MHISTORY останется висеть пустым — снять его
     * владельцу нужно руками (см. README, «Что владельцу нажать»).
     */
    {
        code: 'PRES_LAST_CALL_DATE',
        name: 'Дата последнего касания',
        type: 'datetime',
    },
    {
        code: 'PRES_NEXT_CALL_DATE',
        name: 'Дата следующего касания',
        type: 'datetime',
    },
] as const satisfies readonly PresentationSmartFieldDef[];

/** Код поля смарта — все записи flow типизированы этим union. */
export type PresentationSmartFieldCode =
    (typeof PRESENTATION_SMART_FIELDS)[number]['code'];

/**
 * Определение поля по коду. Нужно потоку, чтобы знать НАСТРОЙКИ поля при
 * записи: формат значения crm-связи зависит от того, к скольким сущностям
 * поле привязано и множественное ли оно (см. buildCrmLinkValue). Зеркало
 * ZPR_FIELD_DEF_BY_CODE.
 */
export const PRESENTATION_FIELD_DEF_BY_CODE = Object.fromEntries(
    PRESENTATION_SMART_FIELDS.map(field => [field.code, field]),
) as Record<PresentationSmartFieldCode, PresentationSmartFieldDef>;

// ---------------------------------------------------------------------------
// Зеркало анкеты: поле реестра pbx → поле смарта
// ---------------------------------------------------------------------------

/**
 * Откуда flow ЧИТАЕТ значение, когда его нет в payload отчёта.
 *
 * Источник №1 у ответов анкеты — сам отчёт (`presentation.survey`), и до
 * сущностей дело доходит только на ЛЕГАСИ-пути: старый React-фронт шлёт
 * анкету отдельным запросом в ручку /presentation-survey. Тогда `lead` —
 * первый источник (ручка пишет «5К», «Разговор» и сводные в лид), а
 * `deal` — базовая сделка — ФОЛБЭК: с 31.08 ручка зеркалит туда тот же
 * состав, и без фолбэка снимок в deal-placement, где лида нет вовсе,
 * оставался пустым (todo3108 №1). Поля «Хвоста» (op_xvost_*) в анкету
 * отчёта не входят и живут ТОЛЬКО на сделке — на любом пути.
 */
export type PresentationSurveySource = 'lead' | 'deal';

export interface PresentationSurveyMirrorEntry {
    /** Код поля в реестре pbx (PBX_SALES_EVENT_FIELDS). */
    source: PbxSalesEventFieldCode;
    /** Куда лечь в элементе смарта. */
    target: PresentationSmartFieldCode;
    /** С какой сущности читать значение. */
    from: PresentationSurveySource;
}

/**
 * Ответы анкеты: один список на оба источника — пара «лид → сделка»
 * строится из каждой записи, поэтому состав чтения НЕ МОЖЕТ разъехаться
 * с составом записи ручки (она пишет одинаково в лид и сделки).
 */
const SURVEY_ANSWER_MIRROR = [
    { source: 'op_presentation_5k', target: 'PRES_5K_SUMMARY' },
    { source: 'op_presentation_xvost', target: 'PRES_XVOST' },
    { source: 'op_5k_client_what', target: 'PRES_5K_CLIENT_WHAT' },
    { source: 'op_5k_client_ready', target: 'PRES_5K_CLIENT_READY' },
    { source: 'op_5k_client_price', target: 'PRES_5K_CLIENT_PRICE' },
    { source: 'op_5k_company_who', target: 'PRES_5K_COMPANY_WHO' },
    { source: 'op_5k_company_how', target: 'PRES_5K_COMPANY_HOW' },
    { source: 'op_5k_company_right', target: 'PRES_5K_COMPANY_RIGHT' },
    { source: 'op_5k_command', target: 'PRES_5K_COMMAND' },
    { source: 'op_5k_concurent', target: 'PRES_5K_CONCURENT' },
    { source: 'op_5k_criteri', target: 'PRES_5K_CRITERI' },
    { source: 'op_talk_impression', target: 'PRES_TALK_IMPRESSION' },
    { source: 'op_talk_remembered', target: 'PRES_TALK_REMEMBERED' },
    { source: 'op_talk_desire', target: 'PRES_TALK_DESIRE' },
    {
        source: 'op_talk_decision_process',
        target: 'PRES_TALK_DECISION_PROCESS',
    },
    { source: 'op_talk_price_opinion', target: 'PRES_TALK_PRICE_OPINION' },
    { source: 'op_talk_boss_readiness', target: 'PRES_TALK_BOSS_READINESS' },
] as const satisfies readonly Omit<PresentationSurveyMirrorEntry, 'from'>[];

/** Булевы вопросы и даты «Хвоста» — только сделка (на лиде их нет). */
const XVOST_DEAL_MIRROR = [
    {
        source: 'op_xvost_decision_call_date',
        target: 'PRES_DECISION_CALL_DATE',
    },
    {
        source: 'op_xvost_decision_date_agreement',
        target: 'PRES_DECISION_AGREEMENT',
    },
    {
        source: 'op_manager_approach_date',
        target: 'PRES_MANAGER_APPROACH_DATE',
    },
    { source: 'op_xvost_is_offer', target: 'PRES_IS_OFFER' },
    { source: 'op_xvost_is_complect', target: 'PRES_IS_COMPLECT' },
    { source: 'op_xvost_is_price', target: 'PRES_IS_PRICE' },
] as const satisfies readonly Omit<PresentationSurveyMirrorEntry, 'from'>[];

/**
 * Карта переноса анкеты в элемент смарта — тот же набор, что копирует
 * event-report в pres-сделку (PRESENTATION_SURVEY_FIELD_CODES +
 * XVOST_DEAL_FIELD_CODES). Смарт получает СВОЙ снимок на каждую
 * презентацию: следующая презентация перезатрёт значения на лиде и сделке,
 * а история по каждой останется в своём элементе.
 *
 * Состав: 17 ответов анкеты (2 сводных + 9 детальных «5К» + 6
 * «Разговора»), каждый парой «лид → сделка-фолбэк», + 6 полей «Хвоста»
 * (op_xvost_*, только со сделки) = 40 записей; длину и парность фиксирует
 * спека. Порядок записей на один target — порядок фолбэка: первое
 * непустое значение побеждает (см. buildPresentationSurveySnapshot).
 *
 * Карта нужна ОБОИМ путям, и состав её от прихода payload не меняется:
 * ответ из payload адресован кодом реестра (`source`), а элементу смарта
 * нужен его собственный код поля (`target`) — перевод одного в другой и
 * есть эта карта. Пара «лид → сделка» обслуживает ЛЕГАСИ-путь и остаётся
 * ради него.
 */
export const PRESENTATION_SMART_SURVEY_MIRROR: readonly PresentationSurveyMirrorEntry[] =
    [
        ...SURVEY_ANSWER_MIRROR.flatMap(entry => [
            { ...entry, from: 'lead' as const },
            { ...entry, from: 'deal' as const },
        ]),
        ...XVOST_DEAL_MIRROR.map(entry => ({
            ...entry,
            from: 'deal' as const,
        })),
    ];

// ---------------------------------------------------------------------------
// Имена полей (канон СКАП: buildSkapUfName / buildSkapItemFieldName)
// ---------------------------------------------------------------------------

/**
 * UF-имя поля для userfieldconfig.*: UF_CRM_{typeId}_{code}.
 * typeId — id смарт-типа из crm.type.list (НЕ entityTypeId!).
 */
export function buildPresentationUfName(
    typeId: number | string,
    code: string,
): string {
    return `UF_CRM_${typeId}_${code}`;
}

/**
 * ФОРМУЛЬНОЕ имя поля в crm.item.* API: camelCase от UF-имени
 * (UF_CRM_8_PRES_BASE_DEAL → ufCrm8PresBaseDeal). Фактический ключ может
 * отличаться (боевой инцидент UF_CRM_94_TRANSCRIPT_1) — установщик сверяет
 * формулу с crm.item.fields и пишет в зеркало фактическое значение.
 */
export function buildPresentationItemFieldName(
    typeId: number | string,
    code: string,
): string {
    const pascal = code
        .toLowerCase()
        .split('_')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
    return `ufCrm${typeId}${pascal}`;
}

/**
 * Суффикс STATUS_ID стадии по коду шаблона: 'pres_plan' → 'PLAN'.
 * Полный STATUS_ID собирает стратегия смартов:
 * DT{entityTypeId}_{bxCategoryId}:{суффикс}.
 */
export function presentationStageBitrixId(stageCode: string): string {
    return stageCode.replace(/^pres_/, '').toUpperCase();
}
