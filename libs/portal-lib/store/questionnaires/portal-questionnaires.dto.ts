import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayNotEmpty,
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsObject,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';
import {
    PORTAL_APP_CODES,
    EnumPortalAppCode,
} from '../app-settings/portal-app-settings.schema';
import {
    PortalQuestionnaireItemRecord,
    PortalQuestionnaireOptionRecord,
    PortalQuestionnaireRecord,
} from './portal-questionnaires.repository';
import {
    EnumQuestionnaireChannel,
    EnumQuestionnaireConditionKind,
    EnumQuestionnaireControl,
    EnumQuestionnaireFieldSource,
    EnumQuestionnaireFieldStatus,
    EnumQuestionnairePersist,
    EnumQuestionnairePlace,
    EnumQuestionnairePresentation,
    EnumQuestionnairePurpose,
    EnumQuestionnaireTargetEntity,
    EnumQuestionnaireTargetMode,
    QUESTIONNAIRE_CHANNELS,
    QUESTIONNAIRE_FIELD_BOUND_CHANNELS,
    QUESTIONNAIRE_CONDITION_KINDS,
    QUESTIONNAIRE_CONTROLS,
    QUESTIONNAIRE_FIELD_SOURCES,
    QUESTIONNAIRE_FIELD_STATUSES,
    QUESTIONNAIRE_PERSISTS,
    QUESTIONNAIRE_PLACES,
    QUESTIONNAIRE_PRESENTATIONS,
    QUESTIONNAIRE_PURPOSES,
    QUESTIONNAIRE_TARGET_ENTITIES,
    QUESTIONNAIRE_TARGET_MODES,
} from './portal-questionnaires.schema';

/**
 * DTO портального каталога анкет.
 *
 * Три группы: реестр для админки (`GET /schema`), тело сохранения и
 * ответы чтения — админский (анкета как в БД) и фреймовый
 * (скомпилированный каталог).
 *
 * На границе HTTP никаких BigInt: `portalId`, `fieldBitrixId` и
 * `updatedBy` — обычные числа. BigInt, доехавший до ответа, роняет
 * сериализацию (глобального `BigInt.prototype.toJSON` в монорепе нет).
 */

// ------------------------------------------------------------------
// Реестр допустимых значений (GET /schema)
// ------------------------------------------------------------------

/** Значение справочника: код + название для админки. */
export class QuestionnaireOptionDescriptorDto {
    @ApiProperty({
        description: 'Код, который уедет в БД и на фронт.',
        example: 'refine',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Название на русском — подпись в админке.',
        example: 'Доработка',
        type: String,
    })
    name: string;

    @ApiPropertyOptional({
        description: 'Что означает и на что влияет.',
        example: 'Анкета видна, когда менеджер планирует доработку.',
        type: String,
    })
    description?: string;
}

/** Вид условия показа со своим справочником значений. */
export class QuestionnaireConditionKindDto {
    @ApiProperty({
        description: 'Вид условия.',
        example: EnumQuestionnaireConditionKind.planType,
        enum: QUESTIONNAIRE_CONDITION_KINDS,
    })
    kind: EnumQuestionnaireConditionKind;

    @ApiProperty({ description: 'Название условия.', type: String })
    name: string;

    @ApiProperty({ description: 'Как условие работает.', type: String })
    description: string;

    @ApiProperty({
        description:
            'Допустимые значения условия. Пусто — условие значений не ' +
            'принимает (например, «Всегда»).',
        type: [QuestionnaireOptionDescriptorDto],
    })
    values: QuestionnaireOptionDescriptorDto[];
}

/** Поле отчёта, доступное каналу `dto`. */
export class QuestionnaireDtoPathDto {
    @ApiProperty({
        description: 'Путь в payload отправки.',
        example: 'sale.opportunity',
        type: String,
    })
    path: string;

    @ApiProperty({ description: 'Название поля отчёта.', type: String })
    name: string;

    @ApiProperty({ description: 'Куда именно уходит значение.', type: String })
    description: string;

    @ApiProperty({
        description: 'Единственный тип отображения для этого поля.',
        enum: QUESTIONNAIRE_CONTROLS,
    })
    control: EnumQuestionnaireControl;
}

/** Строка матрицы «тип поля Битрикса → допустимые типы отображения». */
export class QuestionnaireFieldTypeControlsDto {
    @ApiProperty({
        description: '`userTypeId` поля ровно как его отдаёт Битрикс.',
        example: 'enumeration',
        type: String,
    })
    fieldType: string;

    @ApiProperty({
        description:
            'Типы отображения, которыми это поле можно заполнить. ' +
            'Пусто — поле такого типа в анкету брать нельзя.',
        enum: QUESTIONNAIRE_CONTROLS,
        isArray: true,
    })
    controls: EnumQuestionnaireControl[];
}

/** Реестр целиком: админка строит редактор только по нему. */
export class PortalQuestionnaireSchemaDto {
    @ApiProperty({
        description: 'Версия формы скомпилированного каталога.',
        example: 1,
        type: Number,
    })
    contract: number;

    @ApiProperty({ type: [QuestionnaireOptionDescriptorDto] })
    purposes: QuestionnaireOptionDescriptorDto[];

    @ApiProperty({ type: [QuestionnaireOptionDescriptorDto] })
    presentations: QuestionnaireOptionDescriptorDto[];

    @ApiProperty({ type: [QuestionnaireOptionDescriptorDto] })
    places: QuestionnaireOptionDescriptorDto[];

    @ApiProperty({ type: [QuestionnaireOptionDescriptorDto] })
    persists: QuestionnaireOptionDescriptorDto[];

    @ApiProperty({ type: [QuestionnaireOptionDescriptorDto] })
    controls: QuestionnaireOptionDescriptorDto[];

    @ApiProperty({ type: [QuestionnaireOptionDescriptorDto] })
    channels: QuestionnaireOptionDescriptorDto[];

    @ApiProperty({ type: [QuestionnaireOptionDescriptorDto] })
    targetModes: QuestionnaireOptionDescriptorDto[];

    @ApiProperty({ type: [QuestionnaireOptionDescriptorDto] })
    targetEntities: QuestionnaireOptionDescriptorDto[];

    @ApiProperty({ type: [QuestionnaireOptionDescriptorDto] })
    fieldStatuses: QuestionnaireOptionDescriptorDto[];

    @ApiProperty({
        description: 'Виды условий показа и их справочники значений.',
        type: [QuestionnaireConditionKindDto],
    })
    conditions: QuestionnaireConditionKindDto[];

    @ApiProperty({
        description: 'Поля отчёта для канала «Поле отчёта».',
        type: [QuestionnaireDtoPathDto],
    })
    dtoPaths: QuestionnaireDtoPathDto[];

    @ApiProperty({
        description:
            'Матрица «тип поля → допустимые типы отображения»: редактор ' +
            'обязан фильтровать по ней, иначе неисполнимый пункт вернётся ' +
            'ошибкой сохранения.',
        type: [QuestionnaireFieldTypeControlsDto],
    })
    fieldTypeControls: QuestionnaireFieldTypeControlsDto[];
}

// ------------------------------------------------------------------
// Тело сохранения
// ------------------------------------------------------------------

/** Условие показа анкеты. */
export class PortalQuestionnaireConditionDto {
    @ApiProperty({
        description: 'Вид условия.',
        example: EnumQuestionnaireConditionKind.planType,
        enum: QUESTIONNAIRE_CONDITION_KINDS,
    })
    @IsIn(QUESTIONNAIRE_CONDITION_KINDS)
    kind: EnumQuestionnaireConditionKind;

    @ApiPropertyOptional({
        description:
            'Значения условия (ИЛИ внутри одного условия). Для «Всегда» ' +
            'не задаётся.',
        example: ['refine', 'hot'],
        type: [String],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    values?: string[];
}

/** Вариант справочника для типа отображения «Список». */
export class PortalQuestionnaireOptionSaveDto {
    @ApiProperty({
        description: 'Стабильный код варианта (xmlId, если он осмысленный).',
        example: 'op_decision_postponed',
        type: String,
    })
    @IsString()
    code: string;

    @ApiProperty({
        description: 'Название варианта для менеджера.',
        example: 'Отложил решение',
        type: String,
    })
    @IsString()
    title: string;

    @ApiPropertyOptional({
        description:
            'id элемента списка в Битриксе — именно он уходит в ' +
            '`crm.*.update`. Для канала «Поле CRM» обязателен.',
        example: 555,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    bitrixId?: number | null;

    @ApiPropertyOptional({
        description: 'xmlId элемента списка.',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    xmlId?: string | null;

    @ApiPropertyOptional({
        description: 'Порядок в списке.',
        example: 500,
        type: Number,
    })
    @IsOptional()
    @IsInt()
    sort?: number;

    @ApiPropertyOptional({
        description: 'Вариант предлагается по умолчанию.',
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    isDefault?: boolean;

    @ApiPropertyOptional({
        description:
            'Исчезнувший в Битриксе вариант гасим, а не удаляем: иначе ' +
            'уже собранные ответы становятся необъяснимыми.',
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

/** Вопрос анкеты. */
export class PortalQuestionnaireItemSaveDto {
    @ApiProperty({
        description:
            'Код ВОПРОСА (не поля): ключ ответа во фрейме. Два вопроса ' +
            'могут писать в одно поле и не делить между собой значение.',
        example: 'refine_decision_date',
        type: String,
    })
    @IsString()
    code: string;

    @ApiProperty({
        description: 'Формулировка вопроса менеджеру.',
        example: 'Когда клиент примет решение?',
        type: String,
    })
    @IsString()
    title: string;

    @ApiPropertyOptional({
        description: 'Подсказка внутри поля ввода.',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    placeholder?: string | null;

    @ApiPropertyOptional({
        description: 'Пояснение под контролом.',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    hint?: string | null;

    @ApiPropertyOptional({
        description: 'Заголовок секции внутри анкеты.',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    groupTitle?: string | null;

    @ApiPropertyOptional({
        description: 'Порядок вопроса в анкете.',
        example: 500,
        type: Number,
    })
    @IsOptional()
    @IsInt()
    sort?: number;

    @ApiProperty({
        description:
            'Тип отображения. Должен быть совместим с типом поля по ' +
            'матрице реестра — иначе сохранение отклоняется.',
        example: EnumQuestionnaireControl.date,
        enum: QUESTIONNAIRE_CONTROLS,
    })
    @IsIn(QUESTIONNAIRE_CONTROLS)
    control: EnumQuestionnaireControl;

    @ApiPropertyOptional({
        description:
            'Множественное поле. В этой версии запрещено: запись массивов ' +
            'во фрейме не реализована, ответы исчезали бы бесследно.',
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    isMultiple?: boolean;

    @ApiPropertyOptional({
        description: 'Обязательный вопрос блокирует отправку отчёта.',
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    isRequired?: boolean;

    @ApiPropertyOptional({
        description:
            'Закрывается только ответом этой сессии: значение, уже ' +
            'стоящее в CRM, не считается. Только для канала «Поле CRM».',
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    requireChange?: boolean;

    @ApiPropertyOptional({
        description:
            'Срок годности ответа в днях: значение старше перестаёт ' +
            'закрывать обязательный вопрос. Только для типов «Дата» и ' +
            '«Дата и время».',
        example: 30,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    staleAfterDays?: number | null;

    @ApiPropertyOptional({
        description: 'Куда пишется ответ.',
        example: EnumQuestionnaireChannel.crm,
        enum: QUESTIONNAIRE_CHANNELS,
    })
    @IsOptional()
    @IsIn(QUESTIONNAIRE_CHANNELS)
    channel?: EnumQuestionnaireChannel;

    @ApiPropertyOptional({
        description: 'Как выбирается носитель ответа.',
        example: EnumQuestionnaireTargetMode.auto,
        enum: QUESTIONNAIRE_TARGET_MODES,
    })
    @IsOptional()
    @IsIn(QUESTIONNAIRE_TARGET_MODES)
    targetMode?: EnumQuestionnaireTargetMode;

    @ApiPropertyOptional({
        description: 'Сущность-носитель — только при жёстком выборе.',
        enum: QUESTIONNAIRE_TARGET_ENTITIES,
        nullable: true,
    })
    @IsOptional()
    @IsIn(QUESTIONNAIRE_TARGET_ENTITIES)
    targetEntity?: EnumQuestionnaireTargetEntity | null;

    @ApiPropertyOptional({
        description:
            'Путь в отчёте для канала «Поле отчёта». Только из реестра ' +
            '`dtoPaths`.',
        example: 'sale.opportunity',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    dtoPath?: string | null;

    @ApiPropertyOptional({
        description: 'Штатное поле Битрикса (OPPORTUNITY), не UF.',
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    isNative?: boolean;

    @ApiPropertyOptional({
        description:
            'Полное имя поля РОВНО как его вернул Битрикс. Никогда не ' +
            'собирать конкатенацией с `UF_CRM_`.',
        example: 'UF_CRM_1712345678',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    fieldName?: string | null;

    @ApiPropertyOptional({
        description: 'id поля в Битриксе (вторичный якорь привязки).',
        example: 1234,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    fieldBitrixId?: number | null;

    @ApiPropertyOptional({
        description:
            'xmlId поля. Недоступен, если у ключа портала нет прав ' +
            'администратора CRM.',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    fieldXmlId?: string | null;

    @ApiPropertyOptional({
        description: 'Наш код из pbx-реестра — если поле ставили мы.',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    fieldCode?: string | null;

    @ApiPropertyOptional({
        description:
            '`userTypeId` поля на момент привязки: по нему проверяется ' +
            'матрица и ловится смена типа.',
        example: 'date',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    fieldType?: string | null;

    @ApiPropertyOptional({
        description:
            'Носитель, ИЗ КОТОРОГО поле выбрано в пикере. Обязателен для ' +
            'каналов «Поле CRM» и «Поле элемента смарта» с ' +
            'пользовательским полем: только он связывает поле с сущностью, ' +
            'куда уедет ответ. Поле смарта на канале «Поле CRM» ' +
            'отклоняется (фрейм в смарт не пишет), поле контакта требует ' +
            'жёсткого носителя — цепочка `auto` (компания → сделка → лид) ' +
            'до него не доходит. В БД не хранится: проверяется на ' +
            'сохранении, постоянный адрес смарта — в `smartId`.',
        enum: QUESTIONNAIRE_FIELD_SOURCES,
        example: EnumQuestionnaireFieldSource.company,
    })
    @IsOptional()
    @IsIn(QUESTIONNAIRE_FIELD_SOURCES)
    fieldSource?: EnumQuestionnaireFieldSource;

    @ApiPropertyOptional({
        description:
            'Строка `smarts` НАШЕЙ БД (тот же идентификатор, что в ' +
            '`GET /questionnaire-fields/sources`). Обязателен для канала ' +
            '«Поле элемента смарта»: без него неизвестно, в элемент какого ' +
            'смарта писать ответ. В отличие от `fieldSource` — ' +
            'СОХРАНЯЕТСЯ: по нему компиляция каталога узнаёт поток ' +
            'события, а сверка привязок — где искать поле.',
        type: Number,
        nullable: true,
        example: 12,
    })
    @IsOptional()
    @IsInt()
    smartId?: number | null;

    @ApiPropertyOptional({
        description: 'Состояние привязки (ставится проверкой привязок).',
        enum: QUESTIONNAIRE_FIELD_STATUSES,
    })
    @IsOptional()
    @IsIn(QUESTIONNAIRE_FIELD_STATUSES)
    fieldStatus?: EnumQuestionnaireFieldStatus;

    @ApiPropertyOptional({
        description: 'Расширения без миграций: min/max, rows, маска ввода.',
        type: Object,
        nullable: true,
    })
    @IsOptional()
    @IsObject()
    meta?: Record<string, unknown> | null;

    @ApiPropertyOptional({
        description:
            'Вопрос гасим, а не удаляем: иначе уже собранные ответы в CRM ' +
            'становятся необъяснимыми.',
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @ApiPropertyOptional({
        description:
            'Варианты справочника — только для типа отображения «Список».',
        type: [PortalQuestionnaireOptionSaveDto],
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PortalQuestionnaireOptionSaveDto)
    options?: PortalQuestionnaireOptionSaveDto[];
}

/** Тело сохранения анкеты: состав задаётся ЦЕЛИКОМ, лишнее гасится. */
export class PortalQuestionnaireSaveDto {
    @ApiPropertyOptional({
        description:
            'Идентификатор существующей анкеты. Пусто — ищем по паре ' +
            '(приложение, код) и создаём, если такой ещё нет.',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    id?: string | null;

    @ApiProperty({
        description: 'Код приложения, которому принадлежит анкета.',
        example: EnumPortalAppCode.eventSales,
        enum: PORTAL_APP_CODES,
    })
    @IsIn(PORTAL_APP_CODES)
    appCode: EnumPortalAppCode;

    @ApiProperty({
        description:
            'Стабильный код анкеты внутри приложения: ключ ' +
            '«подтверждено» во фрейме. Задаётся при создании и дальше не ' +
            'меняется.',
        example: 'refine',
        type: String,
    })
    @IsString()
    code: string;

    @ApiProperty({
        description: 'Название анкеты для менеджера.',
        example: 'Доработка',
        type: String,
    })
    @IsString()
    title: string;

    @ApiPropertyOptional({
        description: 'Пояснение, зачем анкету заполнять.',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    hint?: string | null;

    @ApiProperty({
        description: 'Назначение анкеты.',
        example: EnumQuestionnairePurpose.plan,
        enum: QUESTIONNAIRE_PURPOSES,
    })
    @IsIn(QUESTIONNAIRE_PURPOSES)
    purpose: EnumQuestionnairePurpose;

    @ApiPropertyOptional({
        description: 'Способ показа.',
        example: EnumQuestionnairePresentation.inline,
        enum: QUESTIONNAIRE_PRESENTATIONS,
    })
    @IsOptional()
    @IsIn(QUESTIONNAIRE_PRESENTATIONS)
    presentation?: EnumQuestionnairePresentation;

    @ApiPropertyOptional({
        description:
            'Колонка для анкеты-карточки. У модалки не задаётся. Пусто — ' +
            'колонка выводится из назначения анкеты.',
        enum: QUESTIONNAIRE_PLACES,
        nullable: true,
    })
    @IsOptional()
    @IsIn(QUESTIONNAIRE_PLACES)
    place?: EnumQuestionnairePlace | null;

    @ApiPropertyOptional({
        description: 'Когда ответ уезжает из фрейма.',
        example: EnumQuestionnairePersist.onChange,
        enum: QUESTIONNAIRE_PERSISTS,
    })
    @IsOptional()
    @IsIn(QUESTIONNAIRE_PERSISTS)
    persist?: EnumQuestionnairePersist;

    @ApiProperty({
        description:
            'Условия показа: объединяются по И, вид условия не ' +
            'повторяется. Нужно хотя бы одно — для безусловного показа ' +
            'есть условие «Всегда».',
        type: [PortalQuestionnaireConditionDto],
    })
    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => PortalQuestionnaireConditionDto)
    conditions: PortalQuestionnaireConditionDto[];

    @ApiPropertyOptional({
        description:
            'Фича-флаг настроек приложения, включающий анкету на портале ' +
            '(учитывается, только если заполнен).',
        example: 'withChecklistRefine',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    configKey?: string | null;

    @ApiPropertyOptional({
        description:
            'Замещает одноимённый встроенный набор фронта (не ' +
            'добавляется к нему), чтобы не показать два одинаковых.',
        example: 'refine',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    legacyChecklistId?: string | null;

    @ApiPropertyOptional({
        description: 'Анкета включена на портале.',
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @ApiPropertyOptional({
        description: 'Порядок анкеты среди прочих.',
        example: 500,
        type: Number,
    })
    @IsOptional()
    @IsInt()
    sort?: number;

    @ApiPropertyOptional({
        description: 'Битрикс-id сотрудника, сохранившего анкету.',
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    updatedBy?: number | null;

    @ApiProperty({
        description:
            'Состав анкеты ЦЕЛИКОМ: вопрос, которого здесь нет, гасится ' +
            '(из каталога уходит, из БД — нет). Опознаётся по `code`.',
        type: [PortalQuestionnaireItemSaveDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PortalQuestionnaireItemSaveDto)
    items: PortalQuestionnaireItemSaveDto[];
}

/** Результат проверки привязки одного вопроса. */
export class PortalQuestionnaireFieldStatusDto {
    @ApiProperty({
        description: 'Идентификатор вопроса анкеты.',
        type: String,
    })
    @IsString()
    itemId: string;

    @ApiProperty({
        description: 'Состояние привязки по итогам сверки с Битриксом.',
        enum: QUESTIONNAIRE_FIELD_STATUSES,
    })
    @IsIn(QUESTIONNAIRE_FIELD_STATUSES)
    status: EnumQuestionnaireFieldStatus;
}

/** Тело «Проверить привязки»: статусы по вопросам анкеты. */
export class PortalQuestionnaireCheckDto {
    @ApiProperty({
        description: 'Состояния привязок вопросов.',
        type: [PortalQuestionnaireFieldStatusDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PortalQuestionnaireFieldStatusDto)
    statuses: PortalQuestionnaireFieldStatusDto[];
}

// ------------------------------------------------------------------
// Применение расхождений («Подтянуть из Битрикса»)
// ------------------------------------------------------------------

/** Подпись существующего варианта, которую владелец решил подтянуть. */
export class PortalQuestionnaireOptionRenameDto {
    @ApiProperty({
        description: 'Идентификатор варианта ЭТОГО вопроса.',
        type: String,
    })
    @IsString()
    optionId: string;

    @ApiProperty({
        description: 'Подпись варианта из Битрикса.',
        example: 'Тендер (44-ФЗ)',
        type: String,
    })
    @IsString()
    title: string;
}

/**
 * Вариант Битрикса, которого у нас ещё нет.
 *
 * `bitrixId` обязателен: именно он уходит в `crm.*.update`. Вариант без
 * идентификатора элемента списка бесполезен — ответ на него молча
 * потерялся бы.
 */
export class PortalQuestionnaireOptionAddDto {
    @ApiProperty({
        description: 'Идентификатор элемента списка в Битриксе.',
        example: 301,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    bitrixId: number;

    @ApiProperty({
        description: 'Подпись варианта из Битрикса.',
        example: 'Субподряд',
        type: String,
    })
    @IsString()
    title: string;

    @ApiPropertyOptional({
        description: 'Внешний код элемента списка (XML_ID), если он есть.',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    xmlId?: string | null;

    @ApiPropertyOptional({
        description: 'Порядок варианта среди прочих.',
        example: 500,
        type: Number,
    })
    @IsOptional()
    @IsInt()
    sort?: number;
}

/** Что владелец согласился применить по одному вопросу. */
export class PortalQuestionnaireItemSyncDto {
    @ApiProperty({
        description: 'Идентификатор вопроса ЭТОЙ анкеты.',
        type: String,
    })
    @IsString()
    itemId: string;

    @ApiPropertyOptional({
        description:
            'Подпись поля из Битрикса, если владелец решил подтянуть её ' +
            'в формулировку вопроса. Пусто — формулировка остаётся ' +
            'авторской.',
        example: 'Дата решения',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    title?: string | null;

    @ApiPropertyOptional({
        description: 'Подписи существующих вариантов справочника.',
        type: [PortalQuestionnaireOptionRenameDto],
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PortalQuestionnaireOptionRenameDto)
    renameOptions?: PortalQuestionnaireOptionRenameDto[];

    @ApiPropertyOptional({
        description:
            'Варианты Битрикса, которых у нас нет. Заводятся ВКЛЮЧЁННЫМИ ' +
            'и только у типа отображения «Список».',
        type: [PortalQuestionnaireOptionAddDto],
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PortalQuestionnaireOptionAddDto)
    addOptions?: PortalQuestionnaireOptionAddDto[];
}

/**
 * Тело «Подтянуть из Битрикса»: применяется РОВНО то, что владелец
 * отметил в разборе расхождений (`POST /:id/check`).
 */
export class PortalQuestionnaireFieldSyncDto {
    @ApiProperty({
        description:
            'Вопросы, по которым есть что применить. Пустой список — ' +
            'отказ: применять нечего.',
        type: [PortalQuestionnaireItemSyncDto],
    })
    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => PortalQuestionnaireItemSyncDto)
    items: PortalQuestionnaireItemSyncDto[];
}

// ------------------------------------------------------------------
// Ответы чтения: админка
// ------------------------------------------------------------------

/** Вариант справочника как он лежит в БД. */
export class PortalQuestionnaireOptionDto {
    @ApiProperty({ type: String }) id: string;
    @ApiProperty({ type: String }) code: string;
    @ApiProperty({ type: String }) title: string;

    @ApiProperty({
        description: 'id элемента списка в Битриксе.',
        type: Number,
        nullable: true,
    })
    bitrixId: number | null;

    @ApiProperty({ type: String, nullable: true }) xmlId: string | null;
    @ApiProperty({ type: Number }) sort: number;
    @ApiProperty({ type: Boolean }) isDefault: boolean;
    @ApiProperty({ type: Boolean }) isActive: boolean;
}

/** Вопрос анкеты как он лежит в БД. */
export class PortalQuestionnaireItemDto {
    @ApiProperty({ type: String }) id: string;
    @ApiProperty({ type: String }) code: string;
    @ApiProperty({ type: String }) title: string;
    @ApiProperty({ type: String, nullable: true }) placeholder: string | null;
    @ApiProperty({ type: String, nullable: true }) hint: string | null;
    @ApiProperty({ type: String, nullable: true }) groupTitle: string | null;
    @ApiProperty({ type: Number }) sort: number;

    @ApiProperty({ enum: QUESTIONNAIRE_CONTROLS })
    control: EnumQuestionnaireControl;

    @ApiProperty({ type: Boolean }) isMultiple: boolean;
    @ApiProperty({ type: Boolean }) isRequired: boolean;
    @ApiProperty({ type: Boolean }) requireChange: boolean;

    @ApiProperty({ type: Number, nullable: true })
    staleAfterDays: number | null;

    @ApiProperty({ enum: QUESTIONNAIRE_CHANNELS })
    channel: EnumQuestionnaireChannel;

    @ApiProperty({ enum: QUESTIONNAIRE_TARGET_MODES })
    targetMode: EnumQuestionnaireTargetMode;

    @ApiProperty({ enum: QUESTIONNAIRE_TARGET_ENTITIES, nullable: true })
    targetEntity: EnumQuestionnaireTargetEntity | null;

    @ApiProperty({ type: String, nullable: true }) dtoPath: string | null;

    @ApiProperty({
        description:
            'Строка `smarts` НАШЕЙ БД для канала «Поле элемента смарта» — ' +
            'постоянный адрес носителя (тот же идентификатор, что в ' +
            '`GET /questionnaire-fields/sources`). Остальные каналы — null.',
        type: Number,
        nullable: true,
    })
    smartId: number | null;

    @ApiProperty({
        description:
            'Слепок `entityTypeId` смарта на момент привязки: расхождение ' +
            'с живым значением означает переустановку смарта.',
        type: Number,
        nullable: true,
    })
    smartEntityTypeId: number | null;

    @ApiProperty({ type: Boolean }) isNative: boolean;

    @ApiProperty({
        description: 'UF-имя поля ровно как его вернул Битрикс.',
        type: String,
        nullable: true,
    })
    fieldName: string | null;

    @ApiProperty({ type: Number, nullable: true })
    fieldBitrixId: number | null;

    @ApiProperty({ type: String, nullable: true }) fieldXmlId: string | null;
    @ApiProperty({ type: String, nullable: true }) fieldCode: string | null;
    @ApiProperty({ type: String, nullable: true }) fieldType: string | null;

    @ApiProperty({ enum: QUESTIONNAIRE_FIELD_STATUSES })
    fieldStatus: EnumQuestionnaireFieldStatus;

    @ApiProperty({
        description: 'Когда привязку проверяли в последний раз.',
        type: String,
        format: 'date-time',
        nullable: true,
    })
    fieldCheckedAt: Date | null;

    @ApiProperty({ type: Object }) meta: Record<string, unknown>;
    @ApiProperty({ type: Boolean }) isActive: boolean;

    @ApiProperty({ type: [PortalQuestionnaireOptionDto] })
    options: PortalQuestionnaireOptionDto[];
}

/**
 * Строка списка анкет портала — без состава.
 *
 * `issuesCount` — сколько вопросов сейчас НЕ доедет до менеджера:
 * привязка к полю не в состоянии `ok`. Это единственная цифра, по которой
 * из списка видно, что анкета выглядит настроенной, а работает наполовину.
 */
export class PortalQuestionnaireListItemDto {
    @ApiProperty({ type: String }) id: string;

    @ApiProperty({ enum: PORTAL_APP_CODES })
    appCode: EnumPortalAppCode;

    @ApiProperty({ type: String }) code: string;
    @ApiProperty({ type: String }) title: string;

    @ApiProperty({ enum: QUESTIONNAIRE_PURPOSES })
    purpose: EnumQuestionnairePurpose;

    @ApiProperty({
        description: 'Колонка фрейма; у анкеты-модалки всегда null.',
        enum: QUESTIONNAIRE_PLACES,
        nullable: true,
    })
    place: EnumQuestionnairePlace | null;

    @ApiProperty({
        description: 'Сколько вопросов в анкете (включая выключенные).',
        type: Number,
    })
    itemsCount: number;

    @ApiProperty({
        description:
            'Вопросы со сломанной привязкой (статус не «Поле на месте»): ' +
            'в каталог канала «Поле CRM» они не попадают.',
        type: Number,
        example: 0,
    })
    issuesCount: number;

    @ApiProperty({ type: Boolean }) isActive: boolean;
    @ApiProperty({ type: Number }) sort: number;

    @ApiProperty({
        description: 'Растёт на каждое сохранение — фрейм сверяет версию.',
        type: Number,
    })
    version: number;

    @ApiProperty({ type: String, format: 'date-time', nullable: true })
    updatedAt: Date | null;
}

/** Анкета как она лежит в БД (ответ админского API). */
export class PortalQuestionnaireDto {
    @ApiProperty({ type: String }) id: string;

    @ApiProperty({
        description: 'Идентификатор портала (наша БД).',
        type: Number,
    })
    portalId: number;

    @ApiProperty({ type: String }) domain: string;

    @ApiProperty({ enum: PORTAL_APP_CODES })
    appCode: EnumPortalAppCode;

    @ApiProperty({ type: String }) code: string;
    @ApiProperty({ type: String }) title: string;
    @ApiProperty({ type: String, nullable: true }) hint: string | null;

    @ApiProperty({ enum: QUESTIONNAIRE_PURPOSES })
    purpose: EnumQuestionnairePurpose;

    @ApiProperty({ enum: QUESTIONNAIRE_PRESENTATIONS })
    presentation: EnumQuestionnairePresentation;

    @ApiProperty({ enum: QUESTIONNAIRE_PLACES, nullable: true })
    place: EnumQuestionnairePlace | null;

    @ApiProperty({ enum: QUESTIONNAIRE_PERSISTS })
    persist: EnumQuestionnairePersist;

    @ApiProperty({ type: [PortalQuestionnaireConditionDto] })
    conditions: PortalQuestionnaireConditionDto[];

    @ApiProperty({ type: String, nullable: true }) configKey: string | null;

    @ApiProperty({ type: String, nullable: true })
    legacyChecklistId: string | null;

    @ApiProperty({ type: Boolean }) isActive: boolean;
    @ApiProperty({ type: Number }) sort: number;

    @ApiProperty({
        description: 'Растёт на каждое сохранение — фрейм сверяет версию.',
        type: Number,
    })
    version: number;

    @ApiProperty({ type: Number, nullable: true }) updatedBy: number | null;

    @ApiProperty({ type: String, format: 'date-time', nullable: true })
    updatedAt: Date | null;

    @ApiProperty({ type: [PortalQuestionnaireItemDto] })
    items: PortalQuestionnaireItemDto[];
}

/** Ответ «Подтянуть из Битрикса»: анкета после применения и что применили. */
export class PortalQuestionnaireFieldSyncResultDto {
    @ApiProperty({
        description:
            'Анкета целиком после применения: версия уже выросла, ' +
            'редактор перечитывает состав отсюда.',
        type: PortalQuestionnaireDto,
    })
    questionnaire: PortalQuestionnaireDto;

    @ApiProperty({
        description: 'Скольким вопросам подтянули подпись из Битрикса.',
        type: Number,
    })
    appliedTitles: number;

    @ApiProperty({
        description: 'Скольким вариантам подтянули подпись.',
        type: Number,
    })
    renamedOptions: number;

    @ApiProperty({
        description: 'Сколько новых вариантов Битрикса завели.',
        type: Number,
    })
    addedOptions: number;
}

// ------------------------------------------------------------------
// Ответы чтения: фрейм (скомпилированный каталог)
// ------------------------------------------------------------------

/** Условие показа в каталоге. */
export class QuestionnaireCatalogConditionDto {
    @ApiProperty({ enum: QUESTIONNAIRE_CONDITION_KINDS })
    kind: EnumQuestionnaireConditionKind;

    @ApiProperty({
        description: 'Значения условия; для «Всегда» — пустой массив.',
        type: [String],
    })
    values: string[];
}

/** Вариант справочника в каталоге: bitrixId уже готов к записи. */
export class QuestionnaireCatalogOptionDto {
    @ApiProperty({ type: String }) code: string;
    @ApiProperty({ type: String }) title: string;

    @ApiProperty({
        description:
            'Ровно это значение уходит в `crm.*.update`. У канала «Поле ' +
            'элемента смарта» ВСЕГДА null: фрейм в смарт не пишет и ' +
            'адресами чужого справочника не оперирует — ответ уезжает ' +
            'кодом варианта, а в идентификатор элемента его переводит бэк ' +
            'по живому полю смарта.',
        type: Number,
        nullable: true,
    })
    bitrixId: number | null;
}

/** Привязка к полю: готовое имя, собирать ключ не нужно. */
export class QuestionnaireCatalogFieldDto {
    @ApiProperty({
        description: 'Полное имя поля ровно как его вернул Битрикс.',
        example: 'UF_CRM_1712345678',
        type: String,
    })
    name: string;

    @ApiProperty({
        description: '`userTypeId` поля; у штатных полей — null.',
        type: String,
        nullable: true,
    })
    type: string | null;
}

/** Носитель ответа для канала «Поле CRM». */
export class QuestionnaireCatalogTargetDto {
    @ApiProperty({ enum: QUESTIONNAIRE_TARGET_MODES })
    mode: EnumQuestionnaireTargetMode;

    @ApiProperty({ enum: QUESTIONNAIRE_TARGET_ENTITIES, nullable: true })
    entity: EnumQuestionnaireTargetEntity | null;
}

/** Смарт, в элемент которого уедет ответ канала «Поле элемента смарта». */
export class QuestionnaireCatalogSmartDto {
    @ApiProperty({
        description:
            '`kind` смарта из реестра const-смартов: по нему поток ' +
            'события узнаёт «мои ответы».',
        example: 'presentation',
        type: String,
    })
    kind: string;

    @ApiProperty({
        description:
            '`entityTypeId` смарта на момент компиляции — сверка с тем, ' +
            'что резолвит поток.',
        example: 177,
        type: Number,
    })
    entityTypeId: number;
}

/** Вопрос каталога — уже исполнимый. */
export class QuestionnaireCatalogItemDto {
    @ApiProperty({ type: String }) code: string;
    @ApiProperty({ type: String }) title: string;
    @ApiProperty({ type: String, nullable: true }) placeholder: string | null;
    @ApiProperty({ type: String, nullable: true }) hint: string | null;
    @ApiProperty({ type: String, nullable: true }) groupTitle: string | null;
    @ApiProperty({ type: Number }) sort: number;

    @ApiProperty({ enum: QUESTIONNAIRE_CONTROLS })
    control: EnumQuestionnaireControl;

    @ApiProperty({ type: Boolean }) isRequired: boolean;
    @ApiProperty({ type: Boolean }) requireChange: boolean;

    @ApiProperty({ type: Number, nullable: true })
    staleAfterDays: number | null;

    @ApiProperty({ enum: QUESTIONNAIRE_CHANNELS })
    channel: EnumQuestionnaireChannel;

    @ApiProperty({ type: String, nullable: true }) dtoPath: string | null;

    @ApiProperty({ type: QuestionnaireCatalogTargetDto })
    target: QuestionnaireCatalogTargetDto;

    @ApiProperty({
        description:
            'Смарт-носитель для канала «Поле элемента смарта»; null — ' +
            'остальные каналы. Элемент здесь не назван намеренно: ответ ' +
            'уедет в тот, который создаёт или закрывает поток этого ' +
            'события, и его идентификатор известен только бэку.',
        type: QuestionnaireCatalogSmartDto,
        nullable: true,
    })
    smart: QuestionnaireCatalogSmartDto | null;

    @ApiProperty({ type: Boolean }) isNative: boolean;

    @ApiProperty({
        description: 'Привязка к полю; null — вопрос без поля.',
        type: QuestionnaireCatalogFieldDto,
        nullable: true,
    })
    field: QuestionnaireCatalogFieldDto | null;

    @ApiProperty({ type: [QuestionnaireCatalogOptionDto] })
    options: QuestionnaireCatalogOptionDto[];
}

/** Анкета каталога. */
export class QuestionnaireCatalogEntryDto {
    @ApiProperty({ type: String }) code: string;
    @ApiProperty({ type: String }) title: string;
    @ApiProperty({ type: String, nullable: true }) hint: string | null;

    @ApiProperty({ enum: QUESTIONNAIRE_PURPOSES })
    purpose: EnumQuestionnairePurpose;

    @ApiProperty({ enum: QUESTIONNAIRE_PRESENTATIONS })
    presentation: EnumQuestionnairePresentation;

    @ApiProperty({ enum: QUESTIONNAIRE_PLACES, nullable: true })
    place: EnumQuestionnairePlace | null;

    @ApiProperty({ enum: QUESTIONNAIRE_PERSISTS })
    persist: EnumQuestionnairePersist;

    @ApiProperty({ type: [QuestionnaireCatalogConditionDto] })
    conditions: QuestionnaireCatalogConditionDto[];

    @ApiProperty({ type: String, nullable: true }) configKey: string | null;

    @ApiProperty({ type: String, nullable: true })
    legacyChecklistId: string | null;

    @ApiProperty({ type: Number }) sort: number;
    @ApiProperty({ type: Number }) version: number;

    @ApiProperty({ type: [QuestionnaireCatalogItemDto] })
    items: QuestionnaireCatalogItemDto[];
}

/** Скомпилированный каталог приложения на домене. */
export class QuestionnaireCatalogDto {
    @ApiProperty({
        description:
            'Версия ФОРМЫ ответа: фрейм с другим контрактом обязан ' +
            'отказаться от каталога, а не разбирать его наполовину.',
        example: 1,
        type: Number,
    })
    contract: number;

    @ApiProperty({
        description: 'Сумма версий анкет — человекочитаемый счётчик правок.',
        type: Number,
    })
    version: number;

    @ApiProperty({
        description: 'sha1 состава: единственный надёжный компаратор.',
        type: String,
    })
    hash: string;

    @ApiProperty({ type: [QuestionnaireCatalogEntryDto] })
    questionnaires: QuestionnaireCatalogEntryDto[];
}

/** Лёгкий ответ «менялся ли каталог» — без состава. */
export class QuestionnaireCatalogVersionDto {
    @ApiProperty({ type: Number }) version: number;
    @ApiProperty({ type: String }) hash: string;
}

// ------------------------------------------------------------------
// Мапперы «запись БД → ответ админки»
// ------------------------------------------------------------------

/**
 * Коды в записи — строки: в БД лежит то, что записала прошлая версия
 * кода. В DTO это перечисления реестра, и приведение честное ровно
 * потому, что сохранение уже проверило каждое значение по реестру.
 */
export const toPortalQuestionnaireOptionDto = (
    option: PortalQuestionnaireOptionRecord,
): PortalQuestionnaireOptionDto => ({
    id: option.id,
    code: option.code,
    title: option.title,
    bitrixId: option.bitrixId,
    xmlId: option.xmlId,
    sort: option.sort,
    isDefault: option.isDefault,
    isActive: option.isActive,
});

export const toPortalQuestionnaireItemDto = (
    item: PortalQuestionnaireItemRecord,
): PortalQuestionnaireItemDto => ({
    id: item.id,
    code: item.code,
    title: item.title,
    placeholder: item.placeholder,
    hint: item.hint,
    groupTitle: item.groupTitle,
    sort: item.sort,
    control: item.control as EnumQuestionnaireControl,
    isMultiple: item.isMultiple,
    isRequired: item.isRequired,
    requireChange: item.requireChange,
    staleAfterDays: item.staleAfterDays,
    channel: item.channel as EnumQuestionnaireChannel,
    targetMode: item.targetMode as EnumQuestionnaireTargetMode,
    targetEntity: item.targetEntity as EnumQuestionnaireTargetEntity | null,
    dtoPath: item.dtoPath,
    smartId: item.smartId,
    smartEntityTypeId: item.smartEntityTypeId,
    isNative: item.isNative,
    fieldName: item.fieldName,
    fieldBitrixId: item.fieldBitrixId,
    fieldXmlId: item.fieldXmlId,
    fieldCode: item.fieldCode,
    fieldType: item.fieldType,
    fieldStatus: item.fieldStatus as EnumQuestionnaireFieldStatus,
    fieldCheckedAt: item.fieldCheckedAt,
    meta: item.meta,
    isActive: item.isActive,
    options: item.options.map(toPortalQuestionnaireOptionDto),
});

export const toPortalQuestionnaireDto = (
    record: PortalQuestionnaireRecord,
): PortalQuestionnaireDto => ({
    id: record.id,
    portalId: record.portalId,
    domain: record.domain,
    appCode: record.appCode as EnumPortalAppCode,
    code: record.code,
    title: record.title,
    hint: record.hint,
    purpose: record.purpose as EnumQuestionnairePurpose,
    presentation: record.presentation as EnumQuestionnairePresentation,
    place: record.place as EnumQuestionnairePlace | null,
    persist: record.persist as EnumQuestionnairePersist,
    conditions: record.conditions as PortalQuestionnaireConditionDto[],
    configKey: record.configKey,
    legacyChecklistId: record.legacyChecklistId,
    isActive: record.isActive,
    sort: record.sort,
    version: record.version,
    updatedBy: record.updatedBy,
    updatedAt: record.updatedAt,
    items: record.items.map(toPortalQuestionnaireItemDto),
});

/**
 * Строка списка. `issuesCount` считаем по каналам, у которых привязка к
 * полю вообще есть («Поле CRM» и «Поле элемента смарта»): у вопросов в
 * отчёт и в комментарий поля нет, и их статус ни на что не влияет.
 */
export const toPortalQuestionnaireListItemDto = (
    record: PortalQuestionnaireRecord,
): PortalQuestionnaireListItemDto => ({
    id: record.id,
    appCode: record.appCode as EnumPortalAppCode,
    code: record.code,
    title: record.title,
    purpose: record.purpose as EnumQuestionnairePurpose,
    place: record.place as EnumQuestionnairePlace | null,
    itemsCount: record.items.length,
    issuesCount: record.items.filter(
        item =>
            QUESTIONNAIRE_FIELD_BOUND_CHANNELS.includes(
                item.channel as EnumQuestionnaireChannel,
            ) &&
            (item.fieldStatus as EnumQuestionnaireFieldStatus) !==
                EnumQuestionnaireFieldStatus.ok,
    ).length,
    isActive: record.isActive,
    sort: record.sort,
    version: record.version,
    updatedAt: record.updatedAt,
});
