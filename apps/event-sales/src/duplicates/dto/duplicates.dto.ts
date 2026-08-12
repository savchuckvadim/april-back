import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';
import {
    DuplicateEntityType,
    DuplicateSearchLevel,
    DuplicateSignalKind,
} from '@lib/portal-lib/pbx-duplicate';

/* ------------------------------------------------------------------ *
 * Вход
 * ------------------------------------------------------------------ */

export class DuplicateRawSignalsDto {
    @ApiPropertyOptional({
        description: 'Телефоны в любом виде — нормализуются на сервере.',
        type: [String],
        example: ['+7 (999) 123-45-67'],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    phones?: string[];

    @ApiPropertyOptional({
        description: 'Email-адреса.',
        type: [String],
        example: ['client@example.com'],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    emails?: string[];

    @ApiPropertyOptional({
        description:
            'ИНН. Проверяются по контрольной сумме — невалидные отбрасываются.',
        type: [String],
        example: ['7707083893'],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    inns?: string[];

    @ApiPropertyOptional({
        description: 'Названия компаний для подстрочного поиска (уровень 2+).',
        type: [String],
        example: ['Ромашка'],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    titles?: string[];
}

export class SearchDuplicatesRequestDto {
    @ApiProperty({
        description: 'Домен портала Битрикс.',
        example: 'april-garant.bitrix24.ru',
    })
    @IsString()
    domain: string;

    @ApiPropertyOptional({
        enum: DuplicateEntityType,
        description:
            'Сущность, от которой пляшем. Вместе с entityId — сигналы соберутся сами, включая связанные компанию и контакт.',
        example: DuplicateEntityType.LEAD,
    })
    @IsOptional()
    @IsEnum(DuplicateEntityType)
    entityType?: DuplicateEntityType;

    @ApiPropertyOptional({
        description: 'Идентификатор сущности в Битрикс.',
        example: 1234,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    entityId?: number;

    @ApiPropertyOptional({
        type: DuplicateRawSignalsDto,
        description:
            'Сигналы, введённые руками. Можно вместе с entityType/entityId — тогда наборы объединяются.',
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => DuplicateRawSignalsDto)
    raw?: DuplicateRawSignalsDto;

    @ApiPropertyOptional({
        enum: DuplicateSearchLevel,
        description:
            'Глубина: 1 — телефон/email/ИНН по полям (один запрос к порталу), 2 — плюс реквизиты и подстрочный поиск по названию.',
        example: DuplicateSearchLevel.FAST,
        default: DuplicateSearchLevel.FAST,
    })
    @IsOptional()
    @IsEnum(DuplicateSearchLevel)
    level?: DuplicateSearchLevel;

    @ApiPropertyOptional({
        enum: DuplicateEntityType,
        isArray: true,
        description: 'Ограничить поиск типами. Пусто — искать во всех.',
    })
    @IsOptional()
    @IsArray()
    @IsEnum(DuplicateEntityType, { each: true })
    targetTypes?: DuplicateEntityType[];

    @ApiPropertyOptional({
        description:
            'Игнорировать кэш результата (кнопка «искать заново»). Обычный вызов переиспользует ответ в пределах двух минут.',
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    force?: boolean;
}

export class DuplicateDetailsRequestDto {
    @ApiProperty({
        description: 'Домен портала Битрикс.',
        example: 'april-garant.bitrix24.ru',
    })
    @IsString()
    domain: string;

    @ApiProperty({
        enum: DuplicateEntityType,
        description: 'Тип найденного кандидата.',
        example: DuplicateEntityType.COMPANY,
    })
    @IsEnum(DuplicateEntityType)
    entityType: DuplicateEntityType;

    @ApiProperty({ description: 'Идентификатор кандидата.', example: 431 })
    @IsInt()
    @Min(1)
    entityId: number;

    @ApiPropertyOptional({
        description:
            'Показывать и закрытые сделки. Стадия APOLOGY скрыта всегда.',
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    includeClosed?: boolean;
}

/* ------------------------------------------------------------------ *
 * Выход: поиск
 * ------------------------------------------------------------------ */

export class DuplicateSignalsDto {
    @ApiProperty({
        type: [String],
        description: 'Нормализованные телефоны (10 цифр).',
    })
    phones: string[];

    @ApiProperty({ type: [String], description: 'Нормализованные email.' })
    emails: string[];

    @ApiProperty({ type: [String], description: 'Валидные ИНН.' })
    inns: string[];

    @ApiProperty({ type: [String], description: 'Нормализованные названия.' })
    titles: string[];
}

export class DuplicateMatchReasonDto {
    @ApiProperty({
        enum: DuplicateSignalKind,
        description: 'Что совпало.',
        example: DuplicateSignalKind.INN,
    })
    kind: DuplicateSignalKind;

    @ApiProperty({ description: 'Совпавшее значение.', example: '7707083893' })
    value: string;

    @ApiProperty({
        description:
            'Чем нашли: findbycomm, имя UF-поля, RQ_INN или подстрочный фильтр.',
        example: 'UF_CRM_OP_INN',
    })
    via: string;

    @ApiProperty({ description: 'Вклад причины в общий счёт.', example: 100 })
    weight: number;
}

export class DuplicateCandidateDto {
    @ApiProperty({ enum: DuplicateEntityType, description: 'Тип кандидата.' })
    entityType: DuplicateEntityType;

    @ApiProperty({
        description:
            'entityTypeId Битрикса: 1 лид, 2 сделка, 3 контакт, 4 компания.',
        example: 4,
    })
    entityTypeId: number;

    @ApiProperty({ description: 'Идентификатор в Битрикс.', example: 431 })
    id: number;

    @ApiPropertyOptional({
        description: 'Название или ФИО.',
        example: 'ООО «Ромашка»',
    })
    title?: string;

    @ApiProperty({
        description:
            'Уверенность 0–100. Совпадение ИНН по полю — 100, по названию — 40.',
        example: 100,
    })
    score: number;

    @ApiProperty({
        type: [DuplicateMatchReasonDto],
        description: 'Причины совпадения.',
    })
    reasons: DuplicateMatchReasonDto[];
}

export class DuplicateSignalOriginDto {
    @ApiProperty({
        enum: DuplicateEntityType,
        description: 'Откуда взят сигнал.',
    })
    entityType: DuplicateEntityType;

    @ApiProperty({ description: 'Идентификатор источника.', example: 1234 })
    id: number;

    @ApiProperty({
        description: 'Поле-источник: PHONE, EMAIL, UF_CRM_OP_INN, TITLE.',
        example: 'PHONE',
    })
    via: string;
}

export class SearchDuplicatesResponseDto {
    @ApiProperty({ description: 'Домен портала.' })
    domain: string;

    @ApiProperty({ type: DuplicateSignalsDto, description: 'По чему искали.' })
    signals: DuplicateSignalsDto;

    @ApiProperty({
        type: [DuplicateSignalOriginDto],
        description:
            'Откуда взялся каждый сигнал — для объяснения в интерфейсе.',
    })
    origins: DuplicateSignalOriginDto[];

    @ApiProperty({
        type: [DuplicateCandidateDto],
        description: 'Кандидаты, отсортированные по убыванию уверенности.',
    })
    candidates: DuplicateCandidateDto[];

    @ApiProperty({
        enum: DuplicateSearchLevel,
        description: 'Использованная глубина.',
    })
    level: DuplicateSearchLevel;

    @ApiProperty({
        description: 'Ответ отдан из кэша — запросов к порталу не было.',
        example: false,
    })
    fromCache: boolean;

    @ApiProperty({ description: 'Сколько команд ушло в батчи.', example: 5 })
    batchCommands: number;

    @ApiProperty({
        description:
            'Сколько HTTP-запросов реально ушло на портал — цена поиска.',
        example: 1,
    })
    batchRequests: number;

    @ApiProperty({
        type: [String],
        description:
            'Что не удалось: недоступная сущность, нет прав, пустые сигналы.',
    })
    warnings: string[];
}

/* ------------------------------------------------------------------ *
 * Выход: детали кандидата
 * ------------------------------------------------------------------ */

export class ResponsibleHeadDto {
    @ApiProperty({ description: 'Идентификатор руководителя.', example: 12 })
    id: number;

    @ApiProperty({ description: 'ФИО руководителя.', example: 'Петров Пётр' })
    name: string;
}

export class ResponsibleUserDto {
    @ApiProperty({ description: 'Идентификатор сотрудника.', example: 447 })
    id: number;

    @ApiProperty({ description: 'ФИО сотрудника.', example: 'Иванов Иван' })
    name: string;

    @ApiPropertyOptional({ description: 'Должность.', example: 'Менеджер ОП' })
    position?: string;

    @ApiPropertyOptional({
        type: ResponsibleHeadDto,
        description:
            'Руководитель по структуре отделов — ему адресуется запрос на работу с клиентом.',
    })
    head?: ResponsibleHeadDto;
}

export class RelatedStageDto {
    @ApiProperty({ description: 'Сырой STAGE_ID Битрикса.', example: 'C1:NEW' })
    bitrixId: string;

    @ApiPropertyOptional({
        description: 'Код стадии в терминах портала.',
        example: 'sales_new',
    })
    code?: string;

    @ApiPropertyOptional({ description: 'Название стадии.', example: 'Новая' })
    title?: string;

    @ApiPropertyOptional({
        description: 'Цвет стадии из настроек портала — им и красим полоску.',
        example: '#39A8EF',
    })
    color?: string;

    @ApiPropertyOptional({ description: 'Код воронки.', example: 'sales_base' })
    categoryCode?: string;

    @ApiPropertyOptional({
        description: 'Название воронки.',
        example: 'Продажи',
    })
    categoryTitle?: string;

    @ApiPropertyOptional({
        description: 'Позиция стадии в воронке.',
        example: 2,
    })
    order?: number;

    @ApiPropertyOptional({ description: 'Всего стадий в воронке.', example: 8 })
    total?: number;
}

export class RelatedDealDto {
    @ApiProperty({ description: 'Идентификатор сделки.', example: 5512 })
    id: number;

    @ApiProperty({ description: 'Название сделки.' })
    title: string;

    @ApiProperty({ type: RelatedStageDto, description: 'Стадия сделки.' })
    stage: RelatedStageDto;

    @ApiPropertyOptional({
        type: ResponsibleUserDto,
        description: 'Ответственный.',
    })
    responsible?: ResponsibleUserDto;

    @ApiPropertyOptional({ description: 'Сумма сделки.', example: 150000 })
    @IsOptional()
    @IsNumber()
    opportunity?: number;

    @ApiProperty({ description: 'Закрыта ли сделка.', example: false })
    closed: boolean;

    @ApiPropertyOptional({
        description: 'Дата создания.',
        example: '2026-07-01T10:00:00+03:00',
    })
    dateCreate?: string;

    @ApiPropertyOptional({
        description:
            'Лид-первоисточник сделки (стандартный LEAD_ID), если проставлен.',
        example: 318051,
    })
    leadId?: number;
}

export class RelatedLeadDto {
    @ApiProperty({ description: 'Идентификатор лида.', example: 8821 })
    id: number;

    @ApiProperty({ description: 'Название лида.' })
    title: string;

    @ApiPropertyOptional({ description: 'Статус лида.', example: 'IN_PROCESS' })
    statusId?: string;

    @ApiPropertyOptional({
        description: 'Семантика статуса: P — в работе, S — успех, F — провал.',
        example: 'P',
    })
    statusSemanticId?: string;

    @ApiPropertyOptional({
        type: ResponsibleUserDto,
        description: 'Ответственный.',
    })
    responsible?: ResponsibleUserDto;

    @ApiPropertyOptional({ description: 'Дата создания.' })
    dateCreate?: string;

    @ApiPropertyOptional({
        description: 'Стандартный источник Битрикса (WEB/WEBFORM/CALL/...).',
        example: 'WEB',
    })
    sourceId?: string;

    @ApiPropertyOptional({
        description:
            'Сырое значение UF-поля op_source_select (bitrixId item’а); ' +
            'семантику («Заявка с сайта») фронт резолвит по слепку портала.',
        example: '1247',
    })
    opSourceRaw?: string;

    @ApiPropertyOptional({
        description:
            'URL опросника «Оценка» (UF_CRM_LEAD_QUEST_URL) — заполнен у заявок с сайта.',
        example: 'https://www.garant.ru/services/aero/lead/?order_num=3168436',
    })
    questUrl?: string;

    @ApiPropertyOptional({
        description:
            '«Код партнёра» (UF_CRM_REG_NUMBER) — заполнен у заявок с сайта; по нему распределение между отделами.',
        example: '78-00751',
    })
    regNumber?: string;
}

export class RelatedContactDto {
    @ApiProperty({ description: 'Идентификатор контакта.', example: 917 })
    id: number;

    @ApiPropertyOptional({ description: 'Имя.', example: 'Мария' })
    name?: string;

    @ApiPropertyOptional({ description: 'Фамилия.', example: 'Сидорова' })
    lastName?: string;

    @ApiPropertyOptional({
        description: 'Должность (POST).',
        example: 'Главный бухгалтер',
    })
    post?: string;

    @ApiPropertyOptional({
        type: [String],
        description: 'Телефоны контакта.',
        example: ['+7 900 000-00-00'],
    })
    phones?: string[];

    @ApiPropertyOptional({
        type: ResponsibleUserDto,
        description: 'Ответственный.',
    })
    responsible?: ResponsibleUserDto;
}

export class DuplicateDetailsResponseDto {
    @ApiProperty({ enum: DuplicateEntityType, description: 'Тип кандидата.' })
    entityType: DuplicateEntityType;

    @ApiProperty({ description: 'Идентификатор кандидата.', example: 431 })
    entityId: number;

    @ApiPropertyOptional({
        type: ResponsibleUserDto,
        description: 'Ответственный за самого кандидата.',
    })
    responsible?: ResponsibleUserDto;

    @ApiProperty({
        type: [RelatedDealDto],
        description: 'Связанные сделки: по умолчанию только открытые.',
    })
    deals: RelatedDealDto[];

    @ApiProperty({ type: [RelatedLeadDto], description: 'Связанные лиды.' })
    leads: RelatedLeadDto[];

    @ApiProperty({
        type: [RelatedContactDto],
        description:
            'Контакты владельца: у сделки-якоря — её contact items, у компании — её.',
    })
    contacts: RelatedContactDto[];

    @ApiProperty({
        description: 'Сколько HTTP-запросов ушло на портал.',
        example: 3,
    })
    batchRequests: number;

    @ApiProperty({ type: [String], description: 'Что не удалось получить.' })
    warnings: string[];
}

export class DuplicateFieldMapFieldDto {
    @ApiProperty({
        enum: DuplicateEntityType,
        description: 'Сущность, которой принадлежит поле.',
    })
    entityType: DuplicateEntityType;

    @ApiProperty({
        description: 'Имя поля в Битрикс.',
        example: 'UF_CRM_OP_INN',
    })
    fieldName: string;

    @ApiPropertyOptional({
        description: 'Код поля в нашем шаблоне.',
        example: 'op_inn',
    })
    code?: string;

    @ApiPropertyOptional({ description: 'Название поля.', example: 'ИНН' })
    title?: string;

    @ApiProperty({
        description:
            'Источник: template, portalDb, requisite, heuristic (найдено по названию), manual.',
        example: 'template',
    })
    source: string;

    @ApiProperty({ description: 'Участвует ли поле в поиске.', example: true })
    enabled: boolean;
}

export class DuplicateFieldMapResponseDto {
    @ApiProperty({ description: 'Домен портала.' })
    domain: string;

    @ApiProperty({
        description: 'Когда карта собиралась.',
        example: '2026-08-03T12:00:00.000Z',
    })
    scannedAt: string;

    @ApiProperty({
        type: [DuplicateFieldMapFieldDto],
        description: 'Поля портала, в которых лежит ИНН.',
    })
    fields: DuplicateFieldMapFieldDto[];

    @ApiProperty({
        type: [String],
        description: 'Что не удалось просканировать.',
    })
    warnings: string[];
}
