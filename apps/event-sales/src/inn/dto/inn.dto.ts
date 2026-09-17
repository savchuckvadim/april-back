import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import {
    IInnAvailability,
    IInnCandidate,
    IInnCandidateSource,
    IInnConflict,
    IInnCurrent,
    IInnRequisiteCard,
    IInnSnapshot,
    INN_CONFLICT_KIND_VALUES,
    INN_CONFLICT_LEVEL_VALUES,
    INN_ORIGIN_VALUES,
    INN_SOURCE_KIND_VALUES,
    INN_STRENGTH_VALUES,
    InnConflictKind,
    InnConflictLevel,
    InnOrigin,
    InnSourceKind,
    InnStrength,
} from '@lib/portal-lib/pbx-inn';

/* ------------------------------------------------------------------ *
 * Вход
 * ------------------------------------------------------------------ */

export class InnSnapshotQueryDto {
    @ApiProperty({
        description:
            'Домен портала Битрикс, в котором живёт сделка. Фрейм берёт его ' +
            'из данных авторизации приложения.',
        type: String,
        example: 'garantservisvoronezh.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;
}

export class ChooseInnRequestDto {
    @ApiProperty({
        description: 'Домен портала Битрикс, в котором живёт сделка.',
        type: String,
        example: 'garantservisvoronezh.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description:
            'ИНН, который становится текущим по договору. Значение либо уже ' +
            'есть среди кандидатов, либо это новое валидное значение — тогда ' +
            'оно добавляется в пул («добавить вручную»). Проверяется ' +
            'контрольной суммой: 10 знаков у юрлица, 12 у ИП и физлица.',
        type: String,
        example: '7707083893',
    })
    @IsString()
    @IsNotEmpty()
    inn: string;

    @ApiProperty({
        description:
            'Версия снимка, на которой человек принимал решение (поле ' +
            '`version` ответа `GET /inn/deal/{dealId}`). Если состояние ' +
            'успели изменить робот, крон или соседняя вкладка — ответ 409, ' +
            'и карточку нужно перечитать.',
        type: String,
        example: 'a1b2c3d4e5f6',
    })
    @IsString()
    @IsNotEmpty()
    version: string;

    @ApiPropertyOptional({
        description:
            'Id сотрудника Битрикса, который выбирает ИНН. Попадает в запись ' +
            'таймлайна «кто, когда, что выбрал». Не передан — в таймлайне ' +
            'останется «сотрудник».',
        type: Number,
        example: 447,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    userId?: number;
}

export class HideInnRequestDto {
    @ApiProperty({
        description: 'Домен портала Битрикс, в котором живёт сделка.',
        type: String,
        example: 'garantservisvoronezh.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description:
            'ИНН-вариант, который менеджер прячет («это не наш ИНН»). Из ' +
            'пула значение НЕ удаляется: по нему могли уйти документы — ' +
            'вариант просто перестаёт мозолить глаза.',
        type: String,
        example: '7812032055',
    })
    @IsString()
    @IsNotEmpty()
    inn: string;

    @ApiPropertyOptional({
        description: 'Id сотрудника Битрикса, который скрывает вариант.',
        type: Number,
        example: 447,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    userId?: number;

    @ApiPropertyOptional({
        description:
            'true — вернуть ранее скрытый вариант обратно в список. По ' +
            'умолчанию false (скрыть).',
        type: Boolean,
        example: false,
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    restore?: boolean;
}

/* ------------------------------------------------------------------ *
 * Ответ
 * ------------------------------------------------------------------ */

export class InnCandidateSourceDto implements IInnCandidateSource {
    @ApiProperty({
        description: 'Откуда пришло значение.',
        type: String,
        enum: INN_SOURCE_KIND_VALUES,
        example: 'company_requisite',
    })
    kind: InnSourceKind;

    @ApiProperty({
        description: 'Готовая подпись для менеджера, на русском.',
        type: String,
        example: 'из реквизита компании «Ромашка»',
    })
    label: string;

    @ApiPropertyOptional({
        description:
            'Id сущности-источника: заявки, компании, контакта или реквизита.',
        type: Number,
        example: 124063,
    })
    entityId?: number;
}

export class InnCandidateDto implements IInnCandidate {
    @ApiProperty({
        description: 'Значение ИНН, прошедшее контрольную сумму.',
        type: String,
        example: '7707083893',
    })
    inn: string;

    @ApiProperty({
        description: 'Разрядность: 10 — юрлицо, 12 — ИП или физлицо.',
        type: Number,
        example: 10,
    })
    digits: number;

    @ApiProperty({
        description:
            'Сила кандидата. `weak` — значение найдено только в названии, в ' +
            'автоподстановке такое не участвует никогда.',
        type: String,
        enum: INN_STRENGTH_VALUES,
        example: 'strong',
    })
    strength: InnStrength;

    @ApiProperty({
        description: 'Подпись самого надёжного из источников значения.',
        type: String,
        example: 'из реквизита компании «Ромашка»',
    })
    label: string;

    @ApiProperty({
        description: 'Все места, где это значение встретилось.',
        type: [InnCandidateSourceDto],
    })
    sources: InnCandidateSourceDto[];

    @ApiProperty({
        description: 'Значение уже лежит в поле «ИНН варианты» сделки.',
        type: Boolean,
        example: true,
    })
    inPool: boolean;

    @ApiProperty({
        description: 'Это текущий ИНН договора.',
        type: Boolean,
        example: false,
    })
    isCurrent: boolean;

    @ApiProperty({
        description:
            'Вариант скрыт менеджером. Фронт показывает такие отдельным ' +
            'свёрнутым списком.',
        type: Boolean,
        example: false,
    })
    hidden: boolean;
}

export class InnRequisiteCardDto implements IInnRequisiteCard {
    @ApiProperty({
        description: 'Id реквизита в Битриксе.',
        type: Number,
        example: 812,
    })
    id: number;

    @ApiProperty({
        description:
            'Кому принадлежит реквизит. Других владельцев не бывает: у лида ' +
            'и сделки реквизитов нет вовсе.',
        type: String,
        enum: ['company', 'contact'],
        example: 'company',
    })
    ownerType: 'company' | 'contact';

    @ApiProperty({
        description: 'Id компании или контакта — владельца реквизита.',
        type: Number,
        example: 55,
    })
    ownerId: number;

    @ApiProperty({
        description: 'Название компании или имя контакта — владельца.',
        type: String,
        example: 'ООО «Ромашка»',
    })
    ownerTitle: string;

    @ApiProperty({
        description: 'Название самого реквизита в карточке клиента.',
        type: String,
        example: 'Реквизиты головного офиса',
    })
    name: string;

    @ApiProperty({
        description: 'Id шаблона реквизита (пресета).',
        type: Number,
        example: 1,
    })
    presetId: number;

    @ApiProperty({
        description: 'Название шаблона реквизита, если его удалось прочитать.',
        type: String,
        example: 'Организация',
    })
    presetName: string;

    @ApiProperty({
        description: 'ИНН из реквизита (`RQ_INN`).',
        type: String,
        example: '7707083893',
    })
    inn: string;

    @ApiProperty({
        description: 'КПП из реквизита.',
        type: String,
        example: '770701001',
    })
    kpp: string;

    @ApiProperty({
        description: 'Название организации в реквизите.',
        type: String,
        example: 'ООО «Ромашка»',
    })
    companyName: string;

    @ApiProperty({
        description:
            'Этот реквизит привязан к сделке (`crm.requisite.link`) — по нему ' +
            'уйдут счёт и печатные формы.',
        type: Boolean,
        example: true,
    })
    linked: boolean;

    @ApiProperty({
        description:
            'Другие сделки, к которым привязан тот же реквизит. Две пары ' +
            'реквизитов у компании — норма, менеджеру просто нужно видеть ' +
            'картину.',
        type: [Number],
        example: [812],
    })
    otherDealIds: number[];
}

export class InnConflictDto implements IInnConflict {
    @ApiProperty({
        description: 'Вид расхождения.',
        type: String,
        enum: INN_CONFLICT_KIND_VALUES,
        example: 'requisite_mismatch',
    })
    kind: InnConflictKind;

    @ApiProperty({
        description: 'Насколько всё плохо: подсказка, предупреждение, ошибка.',
        type: String,
        enum: INN_CONFLICT_LEVEL_VALUES,
        example: 'error',
    })
    level: InnConflictLevel;

    @ApiProperty({
        description: 'Готовый текст плашки на русском.',
        type: String,
        example:
            'ИНН договора (7707083893) не совпадает с ИНН привязанного реквизита (7812032055).',
    })
    message: string;

    @ApiPropertyOptional({
        description: 'ИНН, которого касается расхождение.',
        type: String,
        example: '7707083893',
    })
    inn?: string;

    @ApiPropertyOptional({
        description: 'Сущности, на которые ссылается плашка: компании, сделки.',
        type: [Number],
        example: [55],
    })
    entityIds?: number[];
}

export class InnCurrentDto implements IInnCurrent {
    @ApiProperty({
        description: 'Текущий ИНН договора (поле «ИНН» сделки).',
        type: String,
        example: '7707083893',
    })
    inn: string;

    @ApiProperty({
        description: 'Разрядность: 10 — юрлицо, 12 — ИП или физлицо.',
        type: Number,
        example: 10,
    })
    digits: number;

    @ApiProperty({
        description:
            'Откуда взялось текущее значение: зеркало привязанного реквизита, ' +
            'выбор человека, автоподстановка или «происхождение неизвестно» ' +
            '(значение досталось от ночного догона).',
        type: String,
        enum: INN_ORIGIN_VALUES,
        example: 'manual',
    })
    origin: InnOrigin;

    @ApiPropertyOptional({
        description: 'Кто выбрал значение — из записи в таймлайне сделки.',
        type: String,
        example: 'Иванов Иван',
    })
    userName?: string;

    @ApiPropertyOptional({
        description: 'Когда значение выбрали (ISO-дата записи таймлайна).',
        type: String,
        example: '2026-09-17T10:20:30+03:00',
    })
    at?: string;

    @ApiPropertyOptional({
        description:
            'Id привязанного реквизита, если текущий ИНН — его зеркало.',
        type: Number,
        example: 812,
    })
    requisiteId?: number;

    @ApiProperty({
        description:
            'Значение похоже на догадку: записи о выборе нет, а вариантов ' +
            'было больше одного. Фронт показывает «проставлено автоматически, ' +
            'подтвердите» — подтверждение снимает признак.',
        type: Boolean,
        example: false,
    })
    unverified: boolean;
}

export class InnAvailabilityDto implements IInnAvailability {
    @ApiProperty({
        description: 'Поле «ИНН» установлено на сделке.',
        type: Boolean,
        example: true,
    })
    dealInnField: boolean;

    @ApiProperty({
        description: 'Поле «ИНН варианты» установлено на сделке.',
        type: Boolean,
        example: true,
    })
    dealPoolField: boolean;

    @ApiProperty({
        description: 'Поле «ИНН» установлено на компании.',
        type: Boolean,
        example: true,
    })
    companyInnField: boolean;

    @ApiProperty({
        description: 'Поле «ИНН варианты» установлено на компании.',
        type: Boolean,
        example: true,
    })
    companyPoolField: boolean;

    @ApiProperty({
        description:
            'Реквизиты клиента читаются: у интеграции есть права на ' +
            'справочник реквизитов.',
        type: Boolean,
        example: true,
    })
    requisitesReadable: boolean;
}

export class InnSnapshotResponseDto implements IInnSnapshot {
    @ApiProperty({
        description: 'Сделка, по которой собран снимок.',
        type: Number,
        example: 25221,
    })
    dealId: number;

    @ApiProperty({
        description: 'Домен портала Битрикс.',
        type: String,
        example: 'garantservisvoronezh.bitrix24.ru',
    })
    domain: string;

    @ApiProperty({
        description:
            'Сделка закрыта (успех или отказ) — ИНН можно только посмотреть. ' +
            'Попытка записи отвечает 409.',
        type: Boolean,
        example: false,
    })
    readOnly: boolean;

    @ApiProperty({
        description:
            'Версия снимка — хеш значений, которые видел человек. Её нужно ' +
            'вернуть в ручку выбора: изменилось состояние — будет 409.',
        type: String,
        example: 'a1b2c3d4e5f6',
    })
    version: string;

    @ApiPropertyOptional({
        description:
            'Текущий ИНН договора с происхождением. null — ИНН не выбран, ' +
            'фронт показывает красную плашку.',
        type: InnCurrentDto,
        nullable: true,
    })
    current: InnCurrentDto | null;

    @ApiProperty({
        description:
            'Пул кандидатов: значение, источники, сила и человеческая подпись. ' +
            'Первым идёт текущий, затем сильные, скрытые — в конце.',
        type: [InnCandidateDto],
    })
    candidates: InnCandidateDto[];

    @ApiProperty({
        description: 'Реквизиты компании и контактов сделки карточками.',
        type: [InnRequisiteCardDto],
    })
    requisites: InnRequisiteCardDto[];

    @ApiProperty({
        description: 'Расхождения, которые фронт показывает плашками.',
        type: [InnConflictDto],
    })
    conflicts: InnConflictDto[];

    @ApiProperty({
        description:
            'Что доступно на портале: установлены ли поля, читаются ли ' +
            'реквизиты. Нужно, чтобы вместо пустого экрана показать причину.',
        type: InnAvailabilityDto,
    })
    availability: InnAvailabilityDto;

    @ApiProperty({
        description:
            'Что не удалось сделать при записи (например, не записалась ' +
            'запись в таймлайн). Пустой массив — всё прошло.',
        type: [String],
        example: [],
    })
    warnings: string[];
}
