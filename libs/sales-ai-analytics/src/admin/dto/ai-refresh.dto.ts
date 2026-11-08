/**
 * DTO сценария «обновить всё по порядку» (`admin/ai-analytics/refresh`):
 * запуск на портале и на всех порталах, состояние сценария и шагов.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
    IsBoolean,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
} from 'class-validator';
import {
    AI_REFRESH_STEP_CODES,
    AI_REFRESH_STEP_STATES,
    type AiRefreshStepCode,
    type AiRefreshStepState,
} from '../refresh/refresh.types';

const trimLower = ({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value;

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Что запустить на всех порталах. */
export class AiRefreshStartAllDto {
    @ApiPropertyOptional({
        description:
            'Закрытый месяц ГГГГ-ММ; не задан — последний закрытый месяц.',
        example: '2026-10',
        type: String,
    })
    @IsOptional()
    @IsString()
    @Matches(MONTH_KEY, { message: 'monthKey: ожидается ГГГГ-ММ' })
    monthKey?: string;

    @ApiProperty({
        description:
            'Сначала переразобрать звонки месяца текущей версией разбора (подсчёт без модели, затем запуск, не больше 1500 звонков).',
        example: true,
        type: Boolean,
    })
    @IsBoolean({ message: 'withReanalysis: ожидается true или false' })
    withReanalysis: boolean;
}

/** Что запустить на одном портале. */
export class AiRefreshStartDto extends AiRefreshStartAllDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty({ message: 'domain обязателен' })
    @Transform(trimLower)
    domain: string;
}

/** Портал в запросе состояния. */
export class AiRefreshStateQueryDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty({ message: 'domain обязателен' })
    @Transform(trimLower)
    domain: string;
}

/** Шаг сценария. */
export class AiRefreshStepDto {
    @ApiProperty({
        description: 'Код шага.',
        enum: AI_REFRESH_STEP_CODES,
        example: 'rebuild',
    })
    code: AiRefreshStepCode;

    @ApiProperty({
        description: 'Название шага.',
        example: 'Пересчёт месяца: витрина, история стадий, прогноз',
        type: String,
    })
    title: string;

    @ApiProperty({
        description:
            'Состояние: pending — ждёт, running — идёт, done — сделан, skipped — пропущен, error — сорвался.',
        enum: AI_REFRESH_STEP_STATES,
        example: 'running',
    })
    state: AiRefreshStepState;

    @ApiProperty({
        description: 'Фаза внутри шага (у переразбора: count, run).',
        example: 'run',
        type: String,
        nullable: true,
    })
    phase: string | null;

    @ApiProperty({
        description: 'Начало текущей фазы, ISO.',
        example: '2026-11-08T15:00:00.000Z',
        type: String,
        nullable: true,
    })
    startedAt: string | null;

    @ApiProperty({
        description: 'Конец шага, ISO.',
        example: null,
        type: String,
        nullable: true,
    })
    finishedAt: string | null;

    @ApiProperty({
        description: 'Что происходит или чем кончилось — словами.',
        example: 'Пересчёт месяца идёт…',
        type: String,
        nullable: true,
    })
    text: string | null;
}

/** Сценарий портала целиком. */
export class AiRefreshScenarioDto {
    @ApiProperty({
        description: 'Id сценария.',
        example: 'b7c1…',
        type: String,
    })
    id: string;

    @ApiProperty({
        description: 'Домен портала.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Обновляемый закрытый месяц ГГГГ-ММ.',
        example: '2026-10',
        type: String,
    })
    monthKey: string;

    @ApiProperty({
        description: 'Первый день месяца.',
        example: '2026-10-01',
        type: String,
    })
    from: string;

    @ApiProperty({
        description: 'Последний день месяца.',
        example: '2026-10-31',
        type: String,
    })
    to: string;

    @ApiProperty({
        description: 'Заказан ли переразбор звонков.',
        example: true,
        type: Boolean,
    })
    withReanalysis: boolean;

    @ApiProperty({
        description: 'Шаги по порядку.',
        type: AiRefreshStepDto,
        isArray: true,
    })
    steps: AiRefreshStepDto[];

    @ApiProperty({
        description: 'Запуск, ISO.',
        example: '2026-11-08T15:00:00.000Z',
        type: String,
    })
    startedAt: string;

    @ApiProperty({
        description: 'Последний тик, ISO.',
        example: '2026-11-08T15:10:00.000Z',
        type: String,
    })
    updatedAt: string;

    @ApiProperty({
        description: 'Все шаги закончились.',
        example: false,
        type: Boolean,
    })
    finished: boolean;

    @ApiProperty({
        description: 'Кто запустил.',
        example: null,
        type: String,
        nullable: true,
    })
    requestedBy: string | null;
}

/** Состояние портала: сценарий или null — не запускали (или прошла неделя). */
export class AiRefreshPortalStateDto {
    @ApiProperty({
        description: 'Домен портала.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Последний сценарий портала.',
        type: AiRefreshScenarioDto,
        nullable: true,
    })
    scenario: AiRefreshScenarioDto | null;
}

/** Порталы с включённой AI-аналитикой. */
export class AiRefreshPortalsDto {
    @ApiProperty({
        description: 'Порталы и их сценарии.',
        type: AiRefreshPortalStateDto,
        isArray: true,
    })
    portals: AiRefreshPortalStateDto[];
}

/** Итог запуска на одном портале. */
export class AiRefreshStartResultDto {
    @ApiProperty({
        description: 'Запущен ли новый сценарий (false — уже шёл).',
        example: true,
        type: Boolean,
    })
    started: boolean;

    @ApiProperty({
        description: 'Итог словами.',
        example: 'Запущено: шаги пойдут по очереди, страницу можно закрыть.',
        type: String,
    })
    message: string;

    @ApiProperty({ description: 'Сценарий.', type: AiRefreshScenarioDto })
    scenario: AiRefreshScenarioDto;
}

/** Итог запуска на всех порталах. */
export class AiRefreshStartAllResultDto {
    @ApiProperty({
        description: 'По порталу на строку.',
        type: AiRefreshStartResultDto,
        isArray: true,
    })
    results: AiRefreshStartResultDto[];
}
