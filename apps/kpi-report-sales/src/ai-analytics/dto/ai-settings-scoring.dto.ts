import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsNumber,
    IsOptional,
    IsString,
    Matches,
    ValidateNested,
} from 'class-validator';
import { CALL_REPORT_SECTION_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { AI_SETTINGS_LIMITS } from '@lib/sales-ai-analytics/settings/ai-settings.types';
import { AI_SETTINGS_DATE_PATTERN } from './ai-settings-blocks.dto';

/** Правило потолка оценки раздела. */
export class AiScoringCapDto {
    @ApiProperty({
        description: 'Код правила (уникален в наборе).',
        type: String,
        example: 'no_next_step',
    })
    @IsString()
    ruleCode: string;

    @ApiPropertyOptional({
        description: 'Условие по-человечески — для блока «Как считаем».',
        type: String,
        example: 'nextStep.set = false',
    })
    @IsOptional()
    @IsString()
    condition?: string;

    @ApiProperty({
        description: 'Раздел рубрики, балл которого ограничивается.',
        enum: CALL_REPORT_SECTION_CODES,
        example: 'CLOSING',
    })
    @IsString()
    section: string;

    @ApiProperty({
        description: 'Потолок балла раздела при срабатывании правила (1–9).',
        type: Number,
        example: 5,
    })
    @IsNumber()
    maxScore: number;

    @ApiPropertyOptional({
        description: 'Флаг разбора, который ставится вместе с потолком.',
        type: String,
        example: 'no_next_step',
    })
    @IsOptional()
    @IsString()
    flag?: string;
}

/** Потолки оценивания и стоп-фразы (меняют шкалу — рвут сравнимость). */
export class AiScoringDto {
    @ApiProperty({
        description: `Правила потолка, не более ${AI_SETTINGS_LIMITS.capsMax}.`,
        type: [AiScoringCapDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AiScoringCapDto)
    caps: AiScoringCapDto[];

    @ApiProperty({
        description: `Стоп-фразы, не более ${AI_SETTINGS_LIMITS.stopWordsMax}.`,
        type: [String],
        example: ['как-то так'],
    })
    @IsArray()
    @IsString({ each: true })
    stopWords: string[];
}

/** Пара гипотезы «при качестве s нужно n презентаций». */
export class AiHypothesisPairDto {
    @ApiProperty({
        description: 'Качество разговора по шкале 1–10 (в гипотезе — 3…10).',
        type: Number,
        example: 8,
    })
    @IsNumber()
    s: number;

    @ApiProperty({
        description: 'Сколько презентаций нужно при таком качестве.',
        type: Number,
        example: 30,
    })
    @IsNumber()
    n: number;
}

/** Гипотеза портала «качество → объём» (делает достижимым режим hypothesis). */
export class AiHypothesisDto {
    @ApiProperty({
        description: `Пары «качество → объём», не меньше ${AI_SETTINGS_LIMITS.hypothesisPairsMin}.`,
        type: [AiHypothesisPairDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AiHypothesisPairDto)
    pairs: AiHypothesisPairDto[];

    @ApiPropertyOptional({
        description: 'С какой даты гипотеза действует.',
        type: String,
        example: '2026-09-08',
    })
    @IsOptional()
    @Matches(AI_SETTINGS_DATE_PATTERN, {
        message: 'since должен быть в формате YYYY-MM-DD',
    })
    since?: string;

    @ApiPropertyOptional({
        description: 'Bitrix-id автора гипотезы.',
        type: String,
        example: '447',
    })
    @IsOptional()
    @IsString()
    author?: string;
}
