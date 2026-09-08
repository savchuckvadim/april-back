import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Min,
    ValidateNested,
} from 'class-validator';
import { AI_SETTINGS_LIMITS } from '@lib/sales-ai-analytics/settings/ai-settings.types';
import {
    AI_ANALYTICS_MANAGER_LEVELS,
    AiAnalyticsManagerLevel,
} from '../constants/ai-overview.const';
import { AiRequestBaseDto } from './ai-request-base.dto';
import { AiAnalyticsEnvelopeDto } from './ai-response-envelope.dto';
import {
    AiManagerAbsencesDto,
    AiPortalEventDto,
    AiTargetsDto,
    AI_SETTINGS_DATE_PATTERN,
} from './ai-settings-blocks.dto';
import { AiManagerParamsDto } from './ai-settings-manager.dto';
import { AiDefinitionsDto, AiModelParamDto } from './ai-settings-model.dto';
import { AiHypothesisDto, AiScoringDto } from './ai-settings-scoring.dto';

/** Уровень менеджера, назначенный РОПом. */
export class AiManagerLevelDto {
    @ApiProperty({
        description: 'Bitrix-id менеджера из периметра requester’а.',
        type: Number,
        example: 447,
    })
    @IsInt()
    @Min(1)
    managerId: number;

    @ApiProperty({
        description: 'Уровень.',
        enum: AI_ANALYTICS_MANAGER_LEVELS,
        example: 'senior',
    })
    @IsIn(AI_ANALYTICS_MANAGER_LEVELS)
    level: AiAnalyticsManagerLevel;

    @ApiPropertyOptional({
        description:
            'Дата начала стажа (YYYY-MM-DD, не позже сегодня в TZ портала); ' +
            'по ней считается tenureMonths.',
        type: String,
        example: '2025-03-01',
    })
    @IsOptional()
    @Matches(AI_SETTINGS_DATE_PATTERN, {
        message: 'since должен быть в формате YYYY-MM-DD',
    })
    since?: string;
}

/**
 * Сохранение настроек витрины (план 6.2, только cup|op). Фаза 2: уровни,
 * цели, отсутствия, параметры менеджеров, определения событий, журнал,
 * гиперпараметры модели, потолки оценивания, гипотеза и подтверждение
 * ростера. Каждый переданный блок заменяет предыдущее значение ключа
 * целиком; **не переданный блок не трогается**.
 */
export class AiSettingsSaveRequestDto extends AiRequestBaseDto {
    @ApiPropertyOptional({
        description:
            'Уровни менеджеров (полный список; пустой массив — сброс к ' +
            'дефолту по стажу; поле не передано — уровни не меняются).',
        type: [AiManagerLevelDto],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(AI_SETTINGS_LIMITS.levelsMax)
    @ValidateNested({ each: true })
    @Type(() => AiManagerLevelDto)
    levels?: AiManagerLevelDto[];

    @ApiPropertyOptional({
        description: 'Цели по уровням и личные цели менеджеров.',
        type: AiTargetsDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AiTargetsDto)
    targets?: AiTargetsDto;

    @ApiPropertyOptional({
        description:
            'Отсутствия менеджеров (отпуск, больничный, обучение): отрезки ' +
            'одного менеджера не пересекаются и не уходят дальше ' +
            `${AI_SETTINGS_LIMITS.absenceHorizonDays} дней вперёд.`,
        type: [AiManagerAbsencesDto],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(AI_SETTINGS_LIMITS.levelsMax)
    @ValidateNested({ each: true })
    @Type(() => AiManagerAbsencesDto)
    absences?: AiManagerAbsencesDto[];

    @ApiPropertyOptional({
        description:
            'Слои параметров по менеджерам (ставка, личная цель и т.п.).',
        type: [AiManagerParamsDto],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(AI_SETTINGS_LIMITS.levelsMax)
    @ValidateNested({ each: true })
    @Type(() => AiManagerParamsDto)
    managerParams?: AiManagerParamsDto[];

    @ApiPropertyOptional({
        description:
            'Определения событий портала. Смена продуктивного звонка, ' +
            'канона презентации, порога длительности или вложенности счетов ' +
            'сдвигает comparableFrom.',
        type: AiDefinitionsDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AiDefinitionsDto)
    definitions?: AiDefinitionsDto;

    @ApiPropertyOptional({
        description: 'Журнал событий портала (полный список).',
        type: [AiPortalEventDto],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(AI_SETTINGS_LIMITS.eventsMax)
    @ValidateNested({ each: true })
    @Type(() => AiPortalEventDto)
    events?: AiPortalEventDto[];

    @ApiPropertyOptional({
        description:
            'Гиперпараметры модели: коды реестра и значения в его ' +
            'диапазонах (κ, forget_lambda, пороги n, f_min и т.п.).',
        type: [AiModelParamDto],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(200)
    @ValidateNested({ each: true })
    @Type(() => AiModelParamDto)
    modelParams?: AiModelParamDto[];

    @ApiPropertyOptional({
        description:
            'Потолки оценивания и стоп-фразы. Меняют шкалу оценки, поэтому ' +
            'сохранение сдвигает comparableFrom.',
        type: AiScoringDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AiScoringDto)
    scoring?: AiScoringDto;

    @ApiPropertyOptional({
        description:
            'Гипотеза «качество → объём»: без неё режим hypothesis ' +
            'недостижим. Сравнимую историю не рвёт.',
        type: AiHypothesisDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AiHypothesisDto)
    hypothesis?: AiHypothesisDto;

    @ApiPropertyOptional({
        description:
            'Дата подтверждения состава и уровней (YYYY-MM-DD, не в ' +
            'будущем). Пустая строка снимает подтверждение.',
        type: String,
        example: '2026-09-08',
    })
    @IsOptional()
    @IsString()
    rosterConfirmedAt?: string;
}

export class AiSettingsSaveResultDto {
    @ApiProperty({
        description:
            'Id ais-записи аудита сохранения (type = ai-analytics-settings-audit).',
        type: String,
        example: '90210',
    })
    id: string;

    @ApiProperty({
        description: 'Сохранённые уровни (пусто — блок не передавали).',
        type: [AiManagerLevelDto],
    })
    levels: AiManagerLevelDto[];

    @ApiProperty({
        description: 'Момент сохранения (ISO, UTC).',
        type: String,
        example: '2026-09-06T09:00:00.000Z',
    })
    savedAt: string;

    @ApiProperty({
        description:
            'Сколько ключей кэша сброшено (overview, attention, model, plan).',
        type: Number,
        example: 3,
    })
    resetCount: number;

    @ApiProperty({
        description:
            'Начало сравнимой истории после сохранения (YYYY-MM-DD); ' +
            'пусто — история ни разу не рвалась настройками.',
        type: String,
        example: '2026-09-08',
    })
    comparableFrom: string;

    @ApiProperty({
        description: 'Версия параметров расчёта после сохранения (sha256).',
        type: String,
        example: 'd41d8cd98f00b204e9800998ecf8427e',
    })
    paramsVersion: string;

    @ApiProperty({
        description:
            'Коды изменений, разорвавших сравнимую историю; пусто — ряды ' +
            'сохранены.',
        type: [String],
        example: ['ai_analytics_definitions.productiveCall'],
    })
    breaksSeries: string[];

    @ApiProperty({
        description:
            'Предупреждения проверки настроек (сохранение состоялось).',
        type: [String],
        example: ['Уровень не задан менеджерам: 501'],
    })
    warnings: string[];
}

export class AiSettingsSaveResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiPropertyOptional({
        description: 'Итог сохранения (при status = ready).',
        type: AiSettingsSaveResultDto,
    })
    data?: AiSettingsSaveResultDto;
}
