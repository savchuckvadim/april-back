import { PBX_DEAL_SALES_BASE_STAGES } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import {
    EVENT_TYPE_REGISTRY,
    findEventTypesBySmartKind,
} from '@lib/portal-lib/pbx/event-type-registry';

/**
 * РЕЕСТР портального каталога анкет — единственный источник правды о том,
 * какие значения вообще исполнимы: назначение анкеты, способ показа, тип
 * контрола, канал записи, виды условий показа и ДОПУСТИМЫЕ ЗНАЧЕНИЯ каждого
 * условия, а также матрица «контрол ↔ тип поля Битрикса».
 *
 * Зачем реестр здесь, а не в админке: админка получает его через
 * `GET /schema` и не хардкодит ни одного кода. Всё, что не описано здесь,
 * НЕ сохраняется (валидация на сохранении, а не при рендере) — иначе портал
 * заведёт `control: 'file'`, менеджер увидит пустое место, и никто не
 * поймёт почему.
 *
 * Правило расширения. Мерка реестра — то, что фрейм РЕАЛЬНО исполняет:
 * значение допустимо, если движок умеет его сегодня ЛИБО учится тем же
 * заходом. Отложенному здесь не место — реестр, который «шире» движка, это
 * обещание, которое приложение не выполнит молча.
 *
 * Долг этапа 8 (без него реестр снова станет шире движка): контролы `text` и
 * `boolean` трёхсостоянием, канал `text` — ответ уходит в комментарий
 * события, `targetMode: 'entity'` вместе с `targetEntity`, все пять видов
 * условий с И-семантикой (`workStatus` и `always` фрейм сегодня не знает
 * вовсе). А `persist: 'onConfirm'` отложен вместе с анкетой
 * AfterPresentation — поэтому его в реестре нет, см. QUESTIONNAIRE_PERSISTS.
 *
 * Колонки таблиц — миграции
 * online/database/migrations/2026_08_28_100000_create_portal_questionnaire_tables.php
 * и .../2026_08_29_100000_add_smart_target_to_questionnaire_items.php
 * (адрес смарта-носителя: `smart_id`, `smart_entity_type_id`).
 *
 * Что добавил канал `smart`. Ответ смарт-анкеты уезжает не в CRM, а в
 * ЭЛЕМЕНТ смарта, который создаёт или закрывает поток события. Поэтому в
 * реестре появились: канал `smart`, носитель `smart`, вид условия
 * `presentationDone` (спонтанную презентацию тип задачи не ловит) и
 * форма QuestionnaireCatalogSmart. Связь «тип события → смарт» — данные,
 * они лежат в EVENT_TYPE_REGISTRY, и оба справочника условий по типу
 * события выводятся оттуда же.
 */

/** Назначение анкеты: планирование следующего шага или отчёт о прошедшем. */
export enum EnumQuestionnairePurpose {
    /** Что нужно узнать/зафиксировать ДО следующего звонка. */
    plan = 'plan',
    /** Что выяснили В разговоре — заполняется при отчёте. */
    report = 'report',
}

/** Как анкета показывается менеджеру. */
export enum EnumQuestionnairePresentation {
    /** Карточкой прямо в колонке. */
    inline = 'inline',
    /** Шагом-модалкой в цепочке отправки отчёта. */
    modal = 'modal',
}

/** Колонка фрейма для `presentation: 'inline'`. */
export enum EnumQuestionnairePlace {
    plan = 'plan',
    report = 'report',
}

/** Когда ответ уезжает из фрейма. */
export enum EnumQuestionnairePersist {
    /** Сразу при изменении (пессимистичная запись с дебаунсом). */
    onChange = 'onChange',
    /**
     * По кнопке подтверждения анкеты. Колонка БД значение принимает, но
     * движок батчем писать пока не умеет — в реестр допустимых значений
     * `onConfirm` вернётся вместе с анкетой AfterPresentation.
     */
    onConfirm = 'onConfirm',
}

/**
 * Тип отображения вопроса. Ровно этот набор разрешён сегодня — он же
 * перечислен в миграции.
 */
export enum EnumQuestionnaireControl {
    /** Однострочный текст. */
    string = 'string',
    /** Многострочный текст (комментарий, формулировка клиента). */
    text = 'text',
    date = 'date',
    datetime = 'datetime',
    /** Числовой ввод (сумма). */
    money = 'money',
    /** Выбор одного варианта справочника. */
    enumeration = 'enumeration',
    /** Да/Нет. */
    boolean = 'boolean',
}

/** Куда уходит ответ. */
export enum EnumQuestionnaireChannel {
    /** Поле сущности CRM (компания/сделка/лид/контакт). */
    crm = 'crm',
    /** Поле отчёта (payload отправки), путь — `dtoPath`. */
    dto = 'dto',
    /** Текстом в комментарий события: пункт без поля. */
    text = 'text',
    /**
     * Поле ЭЛЕМЕНТА СМАРТА, который создаёт или закрывает поток этого
     * события. Фрейм такой ответ НЕ пишет сам — не может: элемента в
     * момент ответа ещё нет. Ответ живёт в стейте и уезжает в payload
     * отчёта, а бэк раскладывает его в тот элемент, который завёл или
     * закрыл поток (плановый, закрываемый, перенесённый, спонтанный).
     * Какой смарт чей — говорит EVENT_TYPE_REGISTRY.
     */
    smart = 'smart',
}

/** Как выбирается носитель ответа для канала `crm`. */
export enum EnumQuestionnaireTargetMode {
    /** Компания → сделка → лид: первая сущность, где поле есть. */
    auto = 'auto',
    /** Жёстко указанный носитель (`targetEntity`). */
    entity = 'entity',
}

/** Сущность-носитель ответа. */
export enum EnumQuestionnaireTargetEntity {
    company = 'company',
    deal = 'deal',
    lead = 'lead',
    contact = 'contact',
    /**
     * Элемент смарта, который ведёт поток этого события. Носитель
     * САМООПИСЫВАЮЩИЙ: конкретный элемент выбирать негде и незачем —
     * ответ едет в тот, который поток создаёт или закрывает. Допустим
     * только вместе с каналом `smart`.
     */
    smart = 'smart',
}

/**
 * Носитель, ИЗ КОТОРОГО поле выбрано в пикере админки. В БД не хранится —
 * нужен ровно на сохранении: поле само по себе адреса не имеет, ответ уедет
 * в ту сущность, которую назвал носитель.
 *
 * Пикер отдаёт поля ПЯТИ носителей, а адресовать движок умеет только
 * цепочку `auto` (компания → сделка → лид) и жёстко указанный
 * `targetEntity`. Без связки «поле ↔ носитель» вопрос с полем смарта или
 * контакта сохранялся бы со статусом `ok`, компиляция бы его пропустила, а
 * фрейм записал бы `UF_CRM_7_…` в компанию — ответ исчезает молча.
 */
export enum EnumQuestionnaireFieldSource {
    company = 'company',
    deal = 'deal',
    lead = 'lead',
    contact = 'contact',
    /**
     * Смарт-процесс. Носителем ответа смарт становится ТОЛЬКО вместе с
     * каналом `smart`: элемент выбирает не анкета, а поток события —
     * поэтому анкета обязана быть привязана к типу события, у которого
     * этот смарт есть (EVENT_TYPE_REGISTRY). Поле смарта на канале `crm`
     * по-прежнему отклоняется: в смарт фрейм не пишет и писать не будет.
     */
    smart = 'smart',
}

/**
 * Вид условия показа анкеты. Семантика списка условий — И: показываем,
 * когда выполнены ВСЕ. Внутри одного условия значения — ИЛИ.
 */
export enum EnumQuestionnaireConditionKind {
    /** Менеджер планирует событие этого типа. */
    planType = 'planType',
    /** Менеджер отчитывается по событию этого типа. */
    reportType = 'reportType',
    /** Отправка двинет основную сделку на эту стадию (stage-predict). */
    targetStage = 'targetStage',
    /** Выбранный статус работы по клиенту. */
    workStatus = 'workStatus',
    /**
     * Менеджер отметил «презентация проведена» — включая СПОНТАННУЮ (в
     * задаче тип другой, а презентация была). Значений не принимает, как
     * `always`.
     *
     * Без этого вида условие `reportType: ['presentation']` спонтанную
     * презентацию не ловит: фрейм сравнивает тип ЗАДАЧИ, а бэк в это
     * время уже создаёт элемент смарта «Презентации». Анкета была бы не
     * показана, а элемент — заведён пустым.
     */
    presentationDone = 'presentationDone',
    /** Без условий — показывать всегда. */
    always = 'always',
}

/** Состояние привязки пункта к полю Битрикса (кнопка «Проверить привязки»). */
export enum EnumQuestionnaireFieldStatus {
    /** Поле на месте, тип совпадает. */
    ok = 'ok',
    /** Поля больше нет на портале. */
    missing = 'missing',
    /** Поле есть, но тип сменился — контрол мог стать неисполнимым. */
    typeChanged = 'type_changed',
}

/** Runtime-массивы для `@IsIn`, Swagger `enum` и проверок сервиса. */
export const QUESTIONNAIRE_PURPOSES = Object.values(EnumQuestionnairePurpose);
export const QUESTIONNAIRE_PRESENTATIONS = Object.values(
    EnumQuestionnairePresentation,
);
export const QUESTIONNAIRE_PLACES = Object.values(EnumQuestionnairePlace);
/**
 * Перечислено руками, а не `Object.values`: `onConfirm` фрейм пока не исполняет.
 * Пока его здесь нет, портал такую анкету не сохранит — вместо тихой
 * подмены поведения админка получит внятную ошибку на сохранении.
 */
export const QUESTIONNAIRE_PERSISTS = [EnumQuestionnairePersist.onChange];
export const QUESTIONNAIRE_CONTROLS = Object.values(EnumQuestionnaireControl);
export const QUESTIONNAIRE_CHANNELS = Object.values(EnumQuestionnaireChannel);

/**
 * Каналы, у которых ответ адресован ПОЛЮ Битрикса, — у остальных
 * (`dto`, `text`) привязки нет вовсе. Список один на бэк: по нему и
 * сверка привязок выбирает, что проверять, и админка считает «сколько
 * вопросов сломано». Разъедься они — сверка чинила бы одно, а бэйдж
 * показывал другое.
 */
export const QUESTIONNAIRE_FIELD_BOUND_CHANNELS: EnumQuestionnaireChannel[] = [
    EnumQuestionnaireChannel.crm,
    EnumQuestionnaireChannel.smart,
];
export const QUESTIONNAIRE_TARGET_MODES = Object.values(
    EnumQuestionnaireTargetMode,
);
export const QUESTIONNAIRE_TARGET_ENTITIES = Object.values(
    EnumQuestionnaireTargetEntity,
);
export const QUESTIONNAIRE_FIELD_SOURCES = Object.values(
    EnumQuestionnaireFieldSource,
);

/**
 * Цепочка `targetMode: auto` — ровно она и ничего больше. Массив один на
 * весь бэк: по нему валидация на сохранении проверяет достижимость поля, по
 * нему же сверка привязок ищет поле в живом Битриксе. Разъедься они — и
 * анкета сохранится исполнимой, а проверка объявит поле пропавшим.
 */
export const QUESTIONNAIRE_AUTO_FIELD_SOURCES: EnumQuestionnaireFieldSource[] =
    [
        EnumQuestionnaireFieldSource.company,
        EnumQuestionnaireFieldSource.deal,
        EnumQuestionnaireFieldSource.lead,
    ];
export const QUESTIONNAIRE_CONDITION_KINDS = Object.values(
    EnumQuestionnaireConditionKind,
);

/**
 * Условия, которые значений НЕ принимают. Список один на бэк: по нему и
 * сохранение отказывает в лишних значениях, и компиляция не выбрасывает
 * анкету за пустой массив. Разъедься они — условие «Всегда» сохранилось
 * бы, а в каталог не попало.
 */
export const QUESTIONNAIRE_VALUELESS_CONDITION_KINDS: EnumQuestionnaireConditionKind[] =
    [
        EnumQuestionnaireConditionKind.always,
        EnumQuestionnaireConditionKind.presentationDone,
    ];

/** Принимает ли вид условия список значений. */
export const isQuestionnaireValuelessCondition = (
    kind: EnumQuestionnaireConditionKind,
): boolean => QUESTIONNAIRE_VALUELESS_CONDITION_KINDS.includes(kind);
export const QUESTIONNAIRE_FIELD_STATUSES = Object.values(
    EnumQuestionnaireFieldStatus,
);

/** Описатель значения справочника для админки: код + человеческое название. */
export interface QuestionnaireOptionDescriptor {
    /** Код, который уедет в БД и на фронт. */
    code: string;
    /** Название на русском — подпись в админке. */
    name: string;
    /** Что означает и на что влияет (подсказка, необязательна). */
    description?: string;
}

/** Назначения анкеты — для селекта админки. */
export const QUESTIONNAIRE_PURPOSE_OPTIONS: QuestionnaireOptionDescriptor[] = [
    {
        code: EnumQuestionnairePurpose.plan,
        name: 'Для планирования',
        description:
            'Что нужно узнать или зафиксировать до следующего звонка: ' +
            'анкета живёт в колонке «Планируем».',
    },
    {
        code: EnumQuestionnairePurpose.report,
        name: 'Для отчётности',
        description:
            'Что выяснили в разговоре: анкета заполняется при отчёте ' +
            'по прошедшему событию.',
    },
];

/** Способы показа анкеты. */
export const QUESTIONNAIRE_PRESENTATION_OPTIONS: QuestionnaireOptionDescriptor[] =
    [
        {
            code: EnumQuestionnairePresentation.inline,
            name: 'Карточкой в колонке',
            description:
                'Видна сразу, заполняется по ходу разговора. Колонку ' +
                'задаёт поле «Где показывать».',
        },
        {
            code: EnumQuestionnairePresentation.modal,
            name: 'Модалкой перед отправкой',
            description:
                'Шаг цепочки отправки отчёта: менеджер не отправит отчёт, ' +
                'не закрыв обязательные пункты.',
        },
    ];

/** Колонки фрейма для анкеты-карточки. */
export const QUESTIONNAIRE_PLACE_OPTIONS: QuestionnaireOptionDescriptor[] = [
    {
        code: EnumQuestionnairePlace.plan,
        name: 'Колонка «Планируем»',
        description: 'Что нужно знать до следующего звонка.',
    },
    {
        code: EnumQuestionnairePlace.report,
        name: 'Колонка «Отчёт»',
        description: 'Что выяснили в этом разговоре.',
    },
];

/**
 * Момент записи ответа. Вариант один: «по кнопке подтверждения» появится в
 * селекте админки тогда же, когда фрейм научится копить ответы, —
 * предлагать выбор, который ничего не меняет, хуже, чем не предлагать.
 */
export const QUESTIONNAIRE_PERSIST_OPTIONS: QuestionnaireOptionDescriptor[] = [
    {
        code: EnumQuestionnairePersist.onChange,
        name: 'Сразу при изменении',
        description:
            'Ответ уезжает в CRM по ходу заполнения — ничего не теряется, ' +
            'даже если фрейм закроют.',
    },
];

/**
 * Типы отображения. Пометка «движок рисует» — про нынешний фрейм
 * event-sales: незнакомый ему контрол не ломает карточку, но и не даёт
 * профильного ввода, поэтому расширять реестр раньше фронта нельзя.
 */
export const QUESTIONNAIRE_CONTROL_OPTIONS: QuestionnaireOptionDescriptor[] = [
    {
        code: EnumQuestionnaireControl.string,
        name: 'Строка',
        description: 'Однострочный ответ своими словами.',
    },
    {
        code: EnumQuestionnaireControl.text,
        name: 'Текст (многострочный)',
        description:
            'Развёрнутый ответ: цитата клиента, договорённости. ' +
            'Пишется в поле как обычная строка.',
    },
    {
        code: EnumQuestionnaireControl.date,
        name: 'Дата',
        description: 'Календарь без времени.',
    },
    {
        code: EnumQuestionnaireControl.datetime,
        name: 'Дата и время',
        description: 'Календарь со временем.',
    },
    {
        code: EnumQuestionnaireControl.money,
        name: 'Сумма',
        description: 'Числовой ввод: сумма, количество.',
    },
    {
        code: EnumQuestionnaireControl.enumeration,
        name: 'Список (один вариант)',
        description:
            'Выбор одного значения справочника. Варианты берутся из ' +
            'самого поля Битрикса вместе с их bitrixId.',
    },
    {
        code: EnumQuestionnaireControl.boolean,
        name: 'Да / Нет',
        description: 'Двухпозиционный ответ.',
    },
];

/** Каналы записи ответа. */
export const QUESTIONNAIRE_CHANNEL_OPTIONS: QuestionnaireOptionDescriptor[] = [
    {
        code: EnumQuestionnaireChannel.crm,
        name: 'Поле CRM',
        description:
            'Ответ пишется в поле компании, сделки, лида или контакта — ' +
            'обычный путь.',
    },
    {
        code: EnumQuestionnaireChannel.dto,
        name: 'Поле отчёта',
        description:
            'Ответ уезжает в отчёт (путь из списка «Поля отчёта») и ' +
            'применяется бэком одной операцией со сменой стадии.',
    },
    {
        code: EnumQuestionnaireChannel.text,
        name: 'Комментарий события',
        description:
            'Пункт без поля: ответ подклеивается текстом к комментарию ' +
            'события. Ничего в CRM не перезаписывает.',
    },
    {
        code: EnumQuestionnaireChannel.smart,
        name: 'Поле элемента смарта',
        description:
            'Ответ пишется в элемент смарта, который создаёт или ' +
            'закрывает поток этого события (плановый, закрываемый, ' +
            'перенесённый или спонтанный). Доступен только анкетам, ' +
            'привязанным к типу события со смартом.',
    },
];

/** Способы выбора носителя ответа. */
export const QUESTIONNAIRE_TARGET_MODE_OPTIONS: QuestionnaireOptionDescriptor[] =
    [
        {
            code: EnumQuestionnaireTargetMode.auto,
            name: 'Автоматически',
            description:
                'Компания → сделка → лид: берётся первая сущность, где ' +
                'поле есть и строка загружена.',
        },
        {
            code: EnumQuestionnaireTargetMode.entity,
            name: 'Жёстко указанная сущность',
            description:
                'Ответ всегда пишется в выбранную сущность. Нет её — ' +
                'пункт не показывается.',
        },
    ];

/** Сущности-носители ответа. */
export const QUESTIONNAIRE_TARGET_ENTITY_OPTIONS: QuestionnaireOptionDescriptor[] =
    [
        { code: EnumQuestionnaireTargetEntity.company, name: 'Компания' },
        { code: EnumQuestionnaireTargetEntity.deal, name: 'Сделка' },
        { code: EnumQuestionnaireTargetEntity.lead, name: 'Лид' },
        { code: EnumQuestionnaireTargetEntity.contact, name: 'Контакт' },
        {
            code: EnumQuestionnaireTargetEntity.smart,
            name: 'Элемент смарта события',
            description:
                'Элемент выбирать не нужно: ответ уедет в тот, который ' +
                'создаёт или закрывает поток этого события. Ставится ' +
                'автоматически вместе с каналом «Поле элемента смарта».',
        },
    ];

/** Состояния привязки к полю. */
export const QUESTIONNAIRE_FIELD_STATUS_OPTIONS: QuestionnaireOptionDescriptor[] =
    [
        {
            code: EnumQuestionnaireFieldStatus.ok,
            name: 'Привязка в порядке',
            description: 'Поле на портале есть, тип совпадает со слепком.',
        },
        {
            code: EnumQuestionnaireFieldStatus.missing,
            name: 'Поле не найдено',
            description:
                'Поля на портале больше нет: пункт в каталог не попадает.',
        },
        {
            code: EnumQuestionnaireFieldStatus.typeChanged,
            name: 'Тип поля изменился',
            description:
                'Поле есть, но тип другой — контрол мог стать ' +
                'неисполнимым, пункт в каталог не попадает.',
        },
    ];

/**
 * Типы планируемого события (условие `planType`).
 *
 * ВЫВОДИТСЯ из EVENT_TYPE_REGISTRY, а не пишется руками: раньше и этот
 * список, и `reportType` были двумя рукописными копиями фронтового
 * алфавита — они уже разошлись с фреймом в подписи `ss`. Кода `cold` в
 * реестре нет: менеджеру он не предлагается, условие на него не
 * сработало бы никогда.
 */
export const QUESTIONNAIRE_PLAN_TYPE_VALUES: QuestionnaireOptionDescriptor[] =
    EVENT_TYPE_REGISTRY.filter(descriptor => descriptor.isPlannable).map(
        ({ code, name }) => ({ code, name }),
    );

/**
 * Типы отчётного события (условие `reportType`).
 *
 * Тот же EVENT_TYPE_REGISTRY целиком — зеркало фронтового union
 * EventTaskEventType: значение выводится разбором заголовка задачи,
 * отдельного API нет.
 */
export const QUESTIONNAIRE_REPORT_TYPE_VALUES: QuestionnaireOptionDescriptor[] =
    EVENT_TYPE_REGISTRY.map(({ code, name }) => ({ code, name }));

/**
 * Статусы работы по клиенту (условие `workStatus`).
 *
 * Зеркало WORK_STATUS_ITEMS
 * (front/apps/event-sales/modules/entities/EventReport/lib/report-catalog.ts).
 */
export const QUESTIONNAIRE_WORK_STATUS_VALUES: QuestionnaireOptionDescriptor[] =
    [
        { code: 'inJob', name: 'В работе' },
        { code: 'setAside', name: 'Отложено' },
        { code: 'success', name: 'Продажа' },
        { code: 'fail', name: 'Отказ' },
        { code: 'notCa', name: 'Не ЦА' },
    ];

/**
 * Названия стадий воронки «ОП Основная» — рядом с кодами лестницы.
 * Сама лестница берётся из PBX_DEAL_SALES_BASE_STAGES: коды стадий живут
 * ТОЛЬКО на бэке, дублировать их здесь нельзя.
 */
const SALES_BASE_STAGE_NAMES: Record<string, string> = {
    sales_new: 'Новая',
    sales_cold: 'Холодные',
    sales_warm: 'Переговоры',
    sales_pres: 'Презентация',
    sales_refine: 'Доработка',
    sales_offer_create: 'Документы',
    sales_document_send: 'Отправлены',
    sales_in_progress: 'В решении',
    sales_money_await: 'В оплате',
    sales_supply: 'Поставка',
    sales_success: 'Успех',
    sales_fail: 'Отказ',
    sales_double: 'Не состоялась',
    sales_not_ca: 'Не ЦА',
};

/** Целевые стадии отправки (условие `targetStage`), по порядку лестницы. */
export const QUESTIONNAIRE_TARGET_STAGE_VALUES: QuestionnaireOptionDescriptor[] =
    PBX_DEAL_SALES_BASE_STAGES.map(stage => ({
        code: stage.code,
        name: SALES_BASE_STAGE_NAMES[stage.code] ?? stage.code,
    }));

/** Допустимые значения по видам условий: `always` значений не принимает. */
export const QUESTIONNAIRE_CONDITION_VALUES: Record<
    EnumQuestionnaireConditionKind,
    QuestionnaireOptionDescriptor[]
> = {
    [EnumQuestionnaireConditionKind.planType]: QUESTIONNAIRE_PLAN_TYPE_VALUES,
    [EnumQuestionnaireConditionKind.reportType]:
        QUESTIONNAIRE_REPORT_TYPE_VALUES,
    [EnumQuestionnaireConditionKind.targetStage]:
        QUESTIONNAIRE_TARGET_STAGE_VALUES,
    [EnumQuestionnaireConditionKind.workStatus]:
        QUESTIONNAIRE_WORK_STATUS_VALUES,
    [EnumQuestionnaireConditionKind.presentationDone]: [],
    [EnumQuestionnaireConditionKind.always]: [],
};

/** Описатель вида условия для админки: что это и из чего выбирать. */
export interface QuestionnaireConditionKindDescriptor {
    kind: EnumQuestionnaireConditionKind;
    name: string;
    description: string;
    /** Допустимые значения; пусто — условие значений не требует. */
    values: QuestionnaireOptionDescriptor[];
}

/** Виды условий показа со своими справочниками значений. */
export const QUESTIONNAIRE_CONDITION_KIND_OPTIONS: QuestionnaireConditionKindDescriptor[] =
    [
        {
            kind: EnumQuestionnaireConditionKind.planType,
            name: 'Тип планируемого события',
            description:
                'Анкета видна, когда менеджер планирует событие одного из ' +
                'выбранных типов.',
            values: QUESTIONNAIRE_PLAN_TYPE_VALUES,
        },
        {
            kind: EnumQuestionnaireConditionKind.reportType,
            name: 'Тип отчётного события',
            description:
                'Анкета видна, когда менеджер отчитывается по событию ' +
                'одного из выбранных типов.',
            values: QUESTIONNAIRE_REPORT_TYPE_VALUES,
        },
        {
            kind: EnumQuestionnaireConditionKind.targetStage,
            name: 'Целевая стадия отправки',
            description:
                'Анкета видна, когда отправка отчёта двинет основную ' +
                'сделку на одну из выбранных стадий. Стадию считает бэк ' +
                '(stage-predict): нет предикта — анкета молчит.',
            values: QUESTIONNAIRE_TARGET_STAGE_VALUES,
        },
        {
            kind: EnumQuestionnaireConditionKind.workStatus,
            name: 'Статус работы',
            description:
                'Анкета видна, когда в отчёте выбран один из статусов ' +
                'работы по клиенту.',
            values: QUESTIONNAIRE_WORK_STATUS_VALUES,
        },
        {
            kind: EnumQuestionnaireConditionKind.presentationDone,
            name: 'Презентация проведена',
            description:
                'Анкета видна, когда менеджер отметил «презентация ' +
                'проведена» — в том числе спонтанную, по задаче другого ' +
                'типа. Значения не задаются. Ровно в этом случае поток ' +
                'заводит элемент смарта «Презентации», а условие «Тип ' +
                'отчётного события» его не ловит: оно сравнивает тип ' +
                'ЗАДАЧИ.',
            values: [],
        },
        {
            kind: EnumQuestionnaireConditionKind.always,
            name: 'Всегда',
            description:
                'Без условий. Значения не задаются — анкета видна на ' +
                'каждом экране своего назначения.',
            values: [],
        },
    ];

/**
 * Условия, по которым анкета привязана к ТИПУ СОБЫТИЯ. И-семантика
 * списка условий значит, что каждое такое условие — самостоятельный
 * шлагбаум: не прошли хоть один — анкеты нет.
 */
const EVENT_TYPE_CONDITION_KINDS: readonly string[] = [
    EnumQuestionnaireConditionKind.planType,
    EnumQuestionnaireConditionKind.reportType,
];

/** Условие анкеты в том виде, в каком его читают правила ниже. */
export interface QuestionnaireConditionLike {
    kind: string;
    values?: string[] | null;
}

/**
 * Достижима ли анкета для смарта этого `kind`: хотя бы одно условие по
 * типу события пересекается с типами, у которых этот смарт есть, либо
 * стоит условие «презентация проведена» (спонтанная презентация — тот же
 * элемент того же смарта).
 *
 * Без этой проверки анкета с полем смарта сохранялась бы недостижимой:
 * поток создаёт элемент презентации, а анкета показана на звонке — ответ
 * собрать негде, и объяснить это владельцу было бы нечем.
 */
export const isQuestionnaireReachableForSmartKind = (
    conditions: QuestionnaireConditionLike[],
    kind: string,
): boolean => {
    const smartTypes = findEventTypesBySmartKind(kind);
    if (smartTypes.length === 0) return false;

    for (const condition of conditions) {
        if (
            condition.kind ===
                EnumQuestionnaireConditionKind.presentationDone &&
            smartTypes.includes('presentation')
        ) {
            return true;
        }
        if (!EVENT_TYPE_CONDITION_KINDS.includes(condition.kind)) {
            continue;
        }
        const values = condition.values ?? [];
        if (values.some(value => smartTypes.includes(value))) return true;
    }
    return false;
};

/**
 * Разбор значения выключателя `questionnaires_disabled_event_types`:
 * CSV кодов типов события. Мусор и коды не из реестра выбрасываются —
 * выключатель, который гасит неизвестно что, хуже выключенного.
 */
export const parseQuestionnaireDisabledEventTypes = (
    raw: string | null | undefined,
): string[] => {
    const known = new Set<string>(EVENT_TYPE_REGISTRY.map(item => item.code));
    const codes = String(raw ?? '')
        .split(',')
        .map(value => value.trim())
        .filter(value => known.has(value));
    return [...new Set(codes)];
};

/**
 * Погашена ли анкета выключателем «анкеты типа события выключены».
 *
 * Правило ровно одно и следует из И-семантики условий: анкета погашена,
 * если хотя бы один её шлагбаум по типу события целиком состоит из
 * выключенных типов — пройти его больше нечем. Анкета без условий по
 * типу события (`workStatus`, `targetStage`, `always`) выключателем не
 * трогается: он гасит анкеты ТИПА СОБЫТИЯ, а не всё подряд.
 *
 * Считается и во фрейме (чтобы анкета не показалась), и на бэке (чтобы
 * ответ старого фрейма не уехал в элемент) — поэтому правило одно.
 */
export const isQuestionnaireDisabledByEventTypes = (
    conditions: QuestionnaireConditionLike[],
    disabledEventTypes: readonly string[],
): boolean => {
    if (disabledEventTypes.length === 0) return false;
    const disabled = new Set(disabledEventTypes);

    for (const condition of conditions) {
        if (
            condition.kind === EnumQuestionnaireConditionKind.presentationDone
        ) {
            if (disabled.has('presentation')) return true;
            continue;
        }
        if (!EVENT_TYPE_CONDITION_KINDS.includes(condition.kind)) {
            continue;
        }
        const values = condition.values ?? [];
        // Пустой список значений — это не «все типы», а сломанное
        // условие: его судьбу решает компиляция, гасить тут нечего.
        if (values.length === 0) continue;
        if (values.every(value => disabled.has(value))) return true;
    }
    return false;
};

/** Описатель поля отчёта для канала `dto`. */
export interface QuestionnaireDtoPathDescriptor {
    /** Путь в payload отправки (`sale.opportunity`). */
    path: string;
    name: string;
    description: string;
    /** Единственный контрол, которым это поле можно заполнять. */
    control: EnumQuestionnaireControl;
}

/**
 * Поля отчёта, доступные каналу `dto`.
 *
 * Реестр закрытый намеренно: раньше пути были строковыми литералами во
 * фронте, и портал, заведший пункт с кодом `OPPORTUNITY`, перезаписал бы
 * сумму сделки чужим ответом. Новый путь появляется здесь только после
 * того, как его научился принимать бэк отчёта.
 */
export const QUESTIONNAIRE_DTO_PATHS: QuestionnaireDtoPathDescriptor[] = [
    {
        path: 'sale.opportunity',
        name: 'Сумма продажи',
        description:
            'Уходит в штатное поле OPPORTUNITY основной сделки вместе с ' +
            'IS_MANUAL_OPPORTUNITY=Y. Применяется только при статусе ' +
            'работы «Продажа».',
        control: EnumQuestionnaireControl.money,
    },
    {
        path: 'sale.firstPayDate',
        name: 'Дата первой оплаты',
        description:
            'Уходит в pbx-поле сделки first_pay_date. Поле не установлено ' +
            'на портале — значение молча пропускается бэком.',
        control: EnumQuestionnaireControl.date,
    },
];

/** Описатель пути отчёта по строке пути; неизвестный путь — undefined. */
export const getQuestionnaireDtoPath = (
    path: string,
): QuestionnaireDtoPathDescriptor | undefined =>
    QUESTIONNAIRE_DTO_PATHS.find(item => item.path === path);

/**
 * МАТРИЦА «тип поля Битрикса → допустимые контролы».
 *
 * Ключ — `userTypeId` поля ровно как его отдаёт Битрикс (EUserFieldType).
 * Тип, которого здесь нет, и тип с пустым списком одинаково означают
 * «поле этого типа в анкету брать нельзя»: у фрейма нет контрола, который
 * записал бы в него значение без потерь.
 */
export const QUESTIONNAIRE_FIELD_TYPE_CONTROLS: Record<
    string,
    EnumQuestionnaireControl[]
> = {
    // Строковое поле принимает и однострочный, и многострочный ответ.
    string: [EnumQuestionnaireControl.string, EnumQuestionnaireControl.text],
    // Ссылка — та же строка, но многострочный ввод для неё бессмыслен.
    url: [EnumQuestionnaireControl.string],
    // Числовые поля заполняются числовым контролом. У integer Битрикс
    // отбросит дробную часть — это ожидаемое поведение самого поля.
    integer: [EnumQuestionnaireControl.money],
    double: [EnumQuestionnaireControl.money],
    money: [EnumQuestionnaireControl.money],
    date: [EnumQuestionnaireControl.date],
    // В поле «дата и время» можно спросить и только дату (время 00:00),
    // обратное запрещено: время в поле-дату Битрикс молча отбросит.
    datetime: [
        EnumQuestionnaireControl.datetime,
        EnumQuestionnaireControl.date,
    ],
    boolean: [EnumQuestionnaireControl.boolean],
    enumeration: [EnumQuestionnaireControl.enumeration],
    // Ниже — типы, которые пока не поддержаны: значение таких полей это не
    // ответ менеджера, а ссылка на объект портала (сотрудник, сущность CRM,
    // элемент инфоблока, файл, адрес). Появится контрол — появится строка.
    crm: [],
    crm_status: [],
    employee: [],
    address: [],
    file: [],
    iblock_element: [],
    iblock_section: [],
};

/** Контролы, допустимые для типа поля; неизвестный тип — пустой список. */
export const getQuestionnaireControlsForFieldType = (
    fieldType: string,
): EnumQuestionnaireControl[] =>
    QUESTIONNAIRE_FIELD_TYPE_CONTROLS[fieldType] ?? [];

/** Исполним ли контрол для поля такого типа. */
export const isQuestionnaireControlAllowed = (
    fieldType: string,
    control: EnumQuestionnaireControl,
): boolean => getQuestionnaireControlsForFieldType(fieldType).includes(control);

/**
 * Версия контракта скомпилированного каталога. Растёт, когда меняется
 * ФОРМА ответа: фрейм со старым контрактом обязан отказаться от каталога,
 * а не разбирать его наполовину.
 *
 * Канал `smart` контракт НЕ поднял намеренно: добавление аддитивно —
 * старый фрейм выбрасывает незнакомый канал поштучно (белые списки
 * нормализатора), а поднятый контракт отправил бы его в fallback целиком.
 * Это была бы потеря рабочих анкет ради одной нерабочей. Контракт
 * поднимется один раз, когда форма действительно сломается.
 */
export const QUESTIONNAIRE_CATALOG_CONTRACT = 1;

/** Условие показа в скомпилированном каталоге. */
export interface QuestionnaireCatalogCondition {
    kind: EnumQuestionnaireConditionKind;
    /** Для `always` — пустой массив. */
    values: string[];
}

/** Вариант справочника: во фрейм уезжает готовый bitrixId элемента. */
export interface QuestionnaireCatalogOption {
    code: string;
    title: string;
    /** Ровно это значение уходит в `crm.*.update`. */
    bitrixId: number | null;
}

/** Привязка пункта к полю: готовое UF-имя, собирать ключ не нужно. */
export interface QuestionnaireCatalogField {
    /** Полное имя поля ровно как его вернул Битрикс. */
    name: string;
    /** `userTypeId` на момент привязки; у штатных полей — null. */
    type: string | null;
}

/** Носитель ответа для канала `crm`. */
export interface QuestionnaireCatalogTarget {
    mode: EnumQuestionnaireTargetMode;
    entity: EnumQuestionnaireTargetEntity | null;
}

/**
 * Смарт, в элемент которого уедет ответ канала `smart`.
 *
 * Объектом, а не голой строкой `kind`: следующим заходом сюда встанет
 * `bitrixId` (id из `crm.type.list`, нужный для создания поля из
 * админки) — и форма ответа при этом не сломается.
 */
export interface QuestionnaireCatalogSmart {
    /** `kind` из CONST_SMART_REGISTRY — по нему поток узнаёт «мои ответы». */
    kind: string;
    /** `entityTypeId` на момент компиляции — сверка с resolveInfo потока. */
    entityTypeId: number;
}

/** Вопрос скомпилированного каталога. */
export interface QuestionnaireCatalogItem {
    code: string;
    title: string;
    placeholder: string | null;
    hint: string | null;
    /** Заголовок секции внутри анкеты; null — пункт вне секций. */
    groupTitle: string | null;
    sort: number;
    control: EnumQuestionnaireControl;
    isRequired: boolean;
    /** Закрывается только ответом этой сессии (канал `crm`). */
    requireChange: boolean;
    /** Срок годности значения в днях (только date/datetime). */
    staleAfterDays: number | null;
    channel: EnumQuestionnaireChannel;
    /** Путь в отчёте для канала `dto`. */
    dtoPath: string | null;
    target: QuestionnaireCatalogTarget;
    /** Смарт-носитель для канала `smart`; null — остальные каналы. */
    smart: QuestionnaireCatalogSmart | null;
    /** Штатное поле Битрикса (OPPORTUNITY), а не пользовательское. */
    isNative: boolean;
    /** Привязка к полю; null — пункт без поля (канал `text`). */
    field: QuestionnaireCatalogField | null;
    /**
     * Варианты справочника. У канала `smart` `bitrixId` всегда null:
     * идентификатор элемента списка — адрес чужой системы, фрейм его не
     * знает и знать не должен; ответ едет КОДОМ варианта, а в id его
     * переводит бэк по живому справочнику смарта.
     */
    options: QuestionnaireCatalogOption[];
}

/** Анкета скомпилированного каталога. */
export interface QuestionnaireCatalogEntry {
    code: string;
    title: string;
    hint: string | null;
    purpose: EnumQuestionnairePurpose;
    presentation: EnumQuestionnairePresentation;
    /** Колонка для карточки; у модалки всегда null. */
    place: EnumQuestionnairePlace | null;
    persist: EnumQuestionnairePersist;
    conditions: QuestionnaireCatalogCondition[];
    /** Фича-флаг настроек приложения; null — анкета включена всегда. */
    configKey: string | null;
    /** Замещаемый встроенный набор фронта; null — анкета самостоятельная. */
    legacyChecklistId: string | null;
    sort: number;
    /** Версия строки анкеты: растёт на каждое сохранение. */
    version: number;
    items: QuestionnaireCatalogItem[];
}

/** Скомпилированный каталог анкет приложения на домене. */
export interface QuestionnaireCatalog {
    /** Версия ФОРМЫ ответа (QUESTIONNAIRE_CATALOG_CONTRACT). */
    contract: number;
    /** Сумма версий анкет каталога — человекочитаемый счётчик правок. */
    version: number;
    /** sha1 нормализованного состава: единственный надёжный компаратор. */
    hash: string;
    questionnaires: QuestionnaireCatalogEntry[];
}

/** Лёгкий ответ «менялся ли каталог» — без самого состава. */
export interface QuestionnaireCatalogVersion {
    version: number;
    hash: string;
}

/** Строка матрицы «тип поля Битрикса → допустимые контролы». */
export interface QuestionnaireFieldTypeControls {
    /** `userTypeId` поля ровно как его отдаёт Битрикс. */
    fieldType: string;
    /** Пусто — поле такого типа в анкету брать нельзя. */
    controls: EnumQuestionnaireControl[];
}

/**
 * Реестр целиком — то, что админка получает через `GET /schema`.
 * Ни один код в админке не хардкодится: селекты, конструктор условий и
 * фильтр контролов по типу поля строятся отсюда.
 */
export interface QuestionnaireSchemaPayload {
    /** Версия формы скомпилированного каталога. */
    contract: number;
    purposes: QuestionnaireOptionDescriptor[];
    presentations: QuestionnaireOptionDescriptor[];
    places: QuestionnaireOptionDescriptor[];
    persists: QuestionnaireOptionDescriptor[];
    controls: QuestionnaireOptionDescriptor[];
    channels: QuestionnaireOptionDescriptor[];
    targetModes: QuestionnaireOptionDescriptor[];
    targetEntities: QuestionnaireOptionDescriptor[];
    fieldStatuses: QuestionnaireOptionDescriptor[];
    conditions: QuestionnaireConditionKindDescriptor[];
    dtoPaths: QuestionnaireDtoPathDescriptor[];
    fieldTypeControls: QuestionnaireFieldTypeControls[];
}

/** Собирает реестр для админки из констант этого файла. */
export const getQuestionnaireSchema = (): QuestionnaireSchemaPayload => ({
    contract: QUESTIONNAIRE_CATALOG_CONTRACT,
    purposes: QUESTIONNAIRE_PURPOSE_OPTIONS,
    presentations: QUESTIONNAIRE_PRESENTATION_OPTIONS,
    places: QUESTIONNAIRE_PLACE_OPTIONS,
    persists: QUESTIONNAIRE_PERSIST_OPTIONS,
    controls: QUESTIONNAIRE_CONTROL_OPTIONS,
    channels: QUESTIONNAIRE_CHANNEL_OPTIONS,
    targetModes: QUESTIONNAIRE_TARGET_MODE_OPTIONS,
    targetEntities: QUESTIONNAIRE_TARGET_ENTITY_OPTIONS,
    fieldStatuses: QUESTIONNAIRE_FIELD_STATUS_OPTIONS,
    conditions: QUESTIONNAIRE_CONDITION_KIND_OPTIONS,
    dtoPaths: QUESTIONNAIRE_DTO_PATHS,
    fieldTypeControls: Object.entries(QUESTIONNAIRE_FIELD_TYPE_CONTROLS).map(
        ([fieldType, controls]) => ({ fieldType, controls }),
    ),
});
