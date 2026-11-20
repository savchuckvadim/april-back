import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    ArrayMaxSize,
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Max,
    Min,
    registerDecorator,
    type ValidationArguments,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
    DEAL_MOVEMENT_ALARM_STATUSES,
    type DealMovementAlarmStatus,
} from '@lib/sales-ai-analytics';
import { isPeriodWithinDays } from '../../calls/dto/calls-period.validator';
import { AiRequestBaseDto } from '../../dto/ai-request-base.dto';
import {
    DEAL_MOVEMENT_MAX_DAYS,
    DEAL_MOVEMENT_PAGE_LIMITS,
    DEAL_MOVEMENT_TEXTS,
} from '../deal-movement-vitrina.const';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const USER_ID_PATTERN = /^\d{1,12}$/;
/** Сколько менеджеров можно выбрать в фильтре. */
const MANAGERS_MAX = 200;

/** Валидатор поля `to`: начало не позже конца, период не длиннее предела. */
function IsDealMovementPeriod(): PropertyDecorator {
    return (target: object, propertyName: string | symbol): void => {
        registerDecorator({
            name: 'dealMovementPeriod',
            target: target.constructor,
            propertyName: String(propertyName),
            options: { message: DEAL_MOVEMENT_TEXTS.period },
            validator: {
                validate(to: unknown, args: ValidationArguments): boolean {
                    const from = (args.object as { from?: unknown }).from;
                    return isPeriodWithinDays(from, to, DEAL_MOVEMENT_MAX_DAYS);
                },
            },
        });
    };
}

/**
 * Обзор витрины «Движение сделок»: период (неделя, месяц — до 92 дней) и
 * при желании — выбранные менеджеры внутри периметра пользователя.
 */
export class DealMovementOverviewRequestDto extends AiRequestBaseDto {
    @ApiProperty({
        description:
            'Начало периода (YYYY-MM-DD, часовой пояс портала), включительно.',
        type: String,
        example: '2026-11-01',
    })
    @IsString()
    @Matches(DATE_PATTERN, { message: 'Начало периода — дата вида ГГГГ-ММ-ДД' })
    from: string;

    @ApiProperty({
        description:
            'Конец периода (YYYY-MM-DD, часовой пояс портала), включительно. ' +
            `Период — не длиннее ${DEAL_MOVEMENT_MAX_DAYS} дней, начало не ` +
            'позже конца. Статусы «на последнюю ночь» — за последнюю ночь ' +
            'периода, по которой есть счёт.',
        type: String,
        example: '2026-11-20',
    })
    @IsString()
    @Matches(DATE_PATTERN, { message: 'Конец периода — дата вида ГГГГ-ММ-ДД' })
    @IsDealMovementPeriod()
    to: string;

    @ApiPropertyOptional({
        description:
            'Bitrix-id менеджеров, которых показать. Пусто — все менеджеры, ' +
            'которых пользователь вправе видеть; чужие id молча отбрасываются.',
        type: [String],
        example: ['447', '512'],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(MANAGERS_MAX)
    @Matches(USER_ID_PATTERN, {
        each: true,
        message: 'Менеджер — числовой id сотрудника',
    })
    managerIds?: string[];
}

/**
 * Список проблемных сделок последней ночи: менеджеры, статусы и страница.
 * Отбор, порядок (по убыванию суммы) и страница — на сервере.
 */
export class DealMovementDealsRequestDto extends AiRequestBaseDto {
    @ApiPropertyOptional({
        description:
            'Bitrix-id ответственных. Пусто — все, кого пользователь вправе ' +
            'видеть; чужие id молча отбрасываются.',
        type: [String],
        example: ['447'],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(MANAGERS_MAX)
    @Matches(USER_ID_PATTERN, {
        each: true,
        message: 'Менеджер — числовой id сотрудника',
    })
    managerIds?: string[];

    @ApiPropertyOptional({
        description:
            'Статусы: rolled_back — «Вернулась назад», abandoned — «Без ' +
            'внимания», stuck — «Без продвижения», at_risk — «Под риском». ' +
            'Пусто — все четыре.',
        type: String,
        isArray: true,
        enum: DEAL_MOVEMENT_ALARM_STATUSES,
        example: ['stuck', 'abandoned'],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(DEAL_MOVEMENT_ALARM_STATUSES.length)
    @IsIn(DEAL_MOVEMENT_ALARM_STATUSES as unknown as string[], {
        each: true,
        message: 'Статус — один из: rolled_back, abandoned, stuck, at_risk',
    })
    statuses?: DealMovementAlarmStatus[];

    @ApiPropertyOptional({
        description: 'Номер страницы, с 1.',
        type: Number,
        minimum: 1,
        default: 1,
        example: 1,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @ApiPropertyOptional({
        description: `Строк на странице: 1–${DEAL_MOVEMENT_PAGE_LIMITS.maxPageSize}.`,
        type: Number,
        minimum: 1,
        maximum: DEAL_MOVEMENT_PAGE_LIMITS.maxPageSize,
        default: DEAL_MOVEMENT_PAGE_LIMITS.defaultPageSize,
        example: 25,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(DEAL_MOVEMENT_PAGE_LIMITS.maxPageSize)
    pageSize?: number;
}
