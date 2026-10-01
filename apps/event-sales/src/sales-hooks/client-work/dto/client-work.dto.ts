import { ApiProperty } from '@nestjs/swagger';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsInt,
    IsNotEmpty,
    IsString,
    Min,
} from 'class-validator';
import { SalesHookRunRequestBaseDto } from '../../core/dto/sales-hook-run-request.dto';

/** Кто клиент сделки: компания, а у сделки без компании — контакт. */
export const CLIENT_WORK_CLIENT_KINDS = ['company', 'contact'] as const;
export type ClientWorkClientKind = (typeof CLIENT_WORK_CLIENT_KINDS)[number];

/** Сколько сделок можно присоединить одной операцией. */
export const CLIENT_WORK_MAX_JOIN = 20;

/** Запрос блока «Открытые сделки по клиенту» для сделки, открытой в «Звонках». */
export class ClientWorkRequestDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24.',
        type: String,
        example: 'example.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description:
            'Сделка, из которой открыт блок: по её компании (или контакту, ' +
            'если компании нет) ищутся все открытые сделки клиента в ' +
            'воронке продаж.',
        type: Number,
        example: 87955,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    dealId: number;

    @ApiProperty({
        description:
            'Bitrix ID сотрудника, который смотрит блок: от него зависит, ' +
            'можно ли присоединять (только руководителю).',
        type: Number,
        example: 309,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    userId: number;
}

/** Клиент сделки. */
export class ClientWorkClientDto {
    @ApiProperty({
        description: 'Компания или контакт (у сделок без компании).',
        type: String,
        enum: CLIENT_WORK_CLIENT_KINDS,
        example: 'company',
    })
    kind: ClientWorkClientKind;

    @ApiProperty({
        description: 'ID компании или контакта в Битриксе.',
        type: Number,
        example: 74379,
    })
    id: number;

    @ApiProperty({
        description: 'Название компании или имя контакта.',
        type: String,
        example: 'ООО «Ромашка»',
    })
    title: string;

    @ApiProperty({
        description: 'ИНН клиента цифрами; пусто — не заполнен.',
        type: String,
        example: '3666123456',
    })
    inn: string;
}

/** Открытая сделка клиента в воронке продаж. */
export class ClientWorkDealDto {
    @ApiProperty({ description: 'ID сделки.', type: Number, example: 26981 })
    id: number;

    @ApiProperty({
        description: 'Название сделки как есть (может быть пустым).',
        type: String,
        example: 'ООО Ромашка',
    })
    title: string;

    @ApiProperty({
        description: 'Название стадии воронки продаж.',
        type: String,
        example: 'Презентация',
    })
    stageName: string;

    @ApiProperty({
        description: 'Bitrix ID ответственного; null — не назначен.',
        type: Number,
        nullable: true,
        example: 439,
    })
    responsibleId: number | null;

    @ApiProperty({
        description: 'Имя ответственного для показа.',
        type: String,
        example: 'Иван Петров',
    })
    responsibleName: string;

    @ApiProperty({
        description:
            'Ответственный работает: аккаунт активен и не в отделе неработающих.',
        type: Boolean,
        example: true,
    })
    responsibleWorking: boolean;

    @ApiProperty({
        description:
            'Ответственный ведёт сделку сам: его открытые задачи по ней или ' +
            'его дело за последние 30 дней.',
        type: Boolean,
        example: false,
    })
    ownWork: boolean;

    @ApiProperty({ description: 'Сумма сделки.', type: Number, example: 55524 })
    opportunity: number;

    @ApiProperty({
        description:
            'Открытых задач по сделке (всех, не только ответственного).',
        type: Number,
        example: 2,
    })
    openTasks: number;

    @ApiProperty({
        description: 'Когда создана (ISO); null — дата не разобралась.',
        type: String,
        nullable: true,
        example: '2026-09-17T00:10:51.000Z',
    })
    createdAt: string | null;

    @ApiProperty({
        description: 'Когда изменена последний раз (ISO); null — нет даты.',
        type: String,
        nullable: true,
        example: '2026-10-01T09:47:14.000Z',
    })
    modifiedAt: string | null;

    @ApiProperty({
        description:
            'Как появилась по-русски («новая заявка», «заведена вручную»…); ' +
            '«первая сделка клиента» — у самой старой.',
        type: String,
        example: 'новая заявка',
    })
    origin: string;

    @ApiProperty({
        description: 'Предлагается оставить основной (как в отчёте по дублям).',
        type: Boolean,
        example: true,
    })
    isMain: boolean;

    @ApiProperty({
        description:
            'Самая свежая по дате изменения: к ней присоединится следующая ' +
            'заявка клиента.',
        type: Boolean,
        example: false,
    })
    isFreshest: boolean;

    @ApiProperty({
        description: 'Это сделка, из которой открыт блок.',
        type: Boolean,
        example: false,
    })
    isCurrent: boolean;
}

/** «Открытые сделки по клиенту»: его открытые сделки и что с ними сделать. */
export class ClientWorkResponseDto {
    @ApiProperty({
        description:
            'Клиент сделки; null — у сделки нет ни компании, ни контакта.',
        type: ClientWorkClientDto,
        nullable: true,
    })
    client: ClientWorkClientDto | null;

    @ApiProperty({
        description:
            'Открытые сделки клиента в воронке продаж: предложенная основная ' +
            'первой, остальные — по дате создания.',
        type: [ClientWorkDealDto],
    })
    deals: ClientWorkDealDto[];

    @ApiProperty({
        description:
            'Какую сделку предлагается оставить основной: работающий ' +
            'ответственный, дальше по воронке, есть сумма и название.',
        type: Number,
        nullable: true,
        example: 26981,
    })
    suggestedMainDealId: number | null;

    @ApiProperty({
        description: 'Самая свежая по дате изменения.',
        type: Number,
        nullable: true,
        example: 42973,
    })
    freshestDealId: number | null;

    @ApiProperty({
        description:
            'Что проверить до присоединения (по-русски): ведут два ' +
            'менеджера, разные ИНН. Пусто — обычный дубль.',
        type: [String],
        example: [
            'У сделок разные ИНН — сначала проверьте, одна ли это организация.',
        ],
    })
    notes: string[];

    @ApiProperty({
        description:
            'Как вели клиента: «как одного клиента», «один ответственный», ' +
            '«параллельно: …»; null — сделка одна.',
        type: String,
        nullable: true,
        example: 'параллельно: Иван Петров и Анна Сидорова',
    })
    howWorked: string | null;

    @ApiProperty({
        description:
            'Можно ли этому сотруднику присоединять (руководитель отдела ' +
            'продаж, проверено на сервере).',
        type: Boolean,
        example: true,
    })
    canJoin: boolean;

    @ApiProperty({
        description:
            'Подсказка, почему присоединять нечего или нельзя; null — можно.',
        type: String,
        nullable: true,
        example: null,
    })
    hint: string | null;
}

/** Присоединить выбранные сделки клиента к основной (кнопка руководителя). */
export class ClientWorkJoinRequestDto extends SalesHookRunRequestBaseDto {
    @ApiProperty({
        description:
            'Основная сделка: открытая сделка клиента в воронке продаж, к ' +
            'которой присоединяются остальные.',
        type: Number,
        example: 26981,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    mainDealId: number;

    @ApiProperty({
        description:
            'Сделки клиента, которые присоединить к основной (1–20). Каждая ' +
            'закрывается стадией «Дубль», задачи, дела, контакты и заявки ' +
            'переходят в основную; ничего не удаляется.',
        type: [Number],
        example: [42973, 87955],
    })
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(CLIENT_WORK_MAX_JOIN)
    @IsInt({ each: true })
    @Min(1, { each: true })
    dealIds: number[];
}
