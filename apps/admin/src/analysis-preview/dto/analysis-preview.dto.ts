import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import {
    ANALYSIS_PREVIEW_ID_PATTERN,
    ANALYSIS_PREVIEW_STATUSES,
    type AnalysisPreviewState,
    type AnalysisPreviewStatus,
} from '@lib/call-lib/call-report/analysis-preview';
import { AnalysisPreviewResultDto } from './analysis-preview-result.dto';

/** Номер расшифровки — целое число из списка «Статистика AI». */
const TRANSCRIPTION_ID_PATTERN = /^\d{1,18}$/;

/** Запуск проверки разбора на одном звонке. */
export class AnalysisPreviewStartDto {
    @ApiProperty({
        description: 'Домен портала, чей звонок берётся для проверки.',
        example: 'gsr.bitrix24.ru',
        type: String,
        maxLength: 255,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    domain: string;

    @ApiProperty({
        description:
            'Номер расшифровки уже разобранного звонка этого портала ' +
            '(виден в списке «Статистика AI»).',
        example: '184523',
        type: String,
        pattern: TRANSCRIPTION_ID_PATTERN.source,
    })
    @IsString()
    @Matches(TRANSCRIPTION_ID_PATTERN, {
        message: 'Номер расшифровки — целое число.',
    })
    transcriptionId: string;
}

/** Опрос состояния проверки. */
export class AnalysisPreviewQueryDto {
    @ApiProperty({
        description: 'Номер проверки из ответа на запуск.',
        example: '0b9f1c9e-6f0e-4a59-9f2b-0f7a8c1d2e3f',
        type: String,
        pattern: ANALYSIS_PREVIEW_ID_PATTERN.source,
    })
    @IsString()
    @Matches(ANALYSIS_PREVIEW_ID_PATTERN, {
        message: 'Номер проверки задан неверно.',
    })
    previewId: string;
}

/** Состояние проверки разбора на звонке. */
export class AnalysisPreviewStateDto implements AnalysisPreviewState {
    @ApiProperty({
        description: 'Номер проверки — по нему читается состояние.',
        example: '0b9f1c9e-6f0e-4a59-9f2b-0f7a8c1d2e3f',
        type: String,
    })
    previewId: string;

    @ApiProperty({
        description:
            'Состояние: в очереди, идёт, готово или не выполнено (причина в error).',
        enum: ANALYSIS_PREVIEW_STATUSES,
        example: 'done',
    })
    status: AnalysisPreviewStatus;

    @ApiProperty({
        description: 'Домен портала.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Номер расшифровки звонка.',
        example: '184523',
        type: String,
    })
    transcriptionId: string;

    @ApiProperty({
        description: 'Причина отказа словами; null — ошибки нет.',
        example:
            'Звонок ещё не разобран: проверка идёт по разобранному звонку.',
        type: String,
        nullable: true,
    })
    error: string | null;

    @ApiProperty({
        description: 'Итог проверки; null — ещё не готово или отказ.',
        type: AnalysisPreviewResultDto,
        nullable: true,
    })
    result: AnalysisPreviewResultDto | null;

    @ApiProperty({
        description: 'Момент последнего изменения состояния, ISO.',
        example: '2026-11-18T11:05:12.000Z',
        type: String,
    })
    updatedAt: string;
}
