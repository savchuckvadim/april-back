import { ApiProperty } from '@nestjs/swagger';
import {
    IsNotEmpty,
    IsObject,
    IsString,
    Matches,
    MaxLength,
} from 'class-validator';
import {
    METHODOLOGY_PREVIEW_ID_PATTERN,
    METHODOLOGY_PREVIEW_STATUSES,
    MethodologyConfigDto,
    type MethodologyPreviewState,
    type MethodologyPreviewStatus,
} from '@lib/call-lib/call-report/methodology';
import { MethodologyPreviewResultDto } from './methodology-preview-result.dto';

/** Номер расшифровки — целое число из списка «Статистика AI». */
const TRANSCRIPTION_ID_PATTERN = /^\d{1,18}$/;

/** Запуск проверки черновика методики на одном звонке. */
export class MethodologyPreviewStartDto {
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

    @ApiProperty({
        description:
            'Черновик конфига методики из формы — как есть, без сохранения.',
        type: MethodologyConfigDto,
    })
    @IsObject()
    config: Record<string, unknown>;
}

/** Опрос состояния проверки. */
export class MethodologyPreviewQueryDto {
    @ApiProperty({
        description: 'Номер проверки из ответа на запуск.',
        example: '0b9f1c9e-6f0e-4a59-9f2b-0f7a8c1d2e3f',
        type: String,
        pattern: METHODOLOGY_PREVIEW_ID_PATTERN.source,
    })
    @IsString()
    @Matches(METHODOLOGY_PREVIEW_ID_PATTERN, {
        message: 'Номер проверки задан неверно.',
    })
    previewId: string;
}

/** Состояние проверки черновика методики. */
export class MethodologyPreviewStateDto implements MethodologyPreviewState {
    @ApiProperty({
        description: 'Номер проверки — по нему читается состояние.',
        example: '0b9f1c9e-6f0e-4a59-9f2b-0f7a8c1d2e3f',
        type: String,
    })
    previewId: string;

    @ApiProperty({
        description:
            'Состояние: в очереди, идёт, готово или не выполнено (причина в error).',
        enum: METHODOLOGY_PREVIEW_STATUSES,
        example: 'done',
    })
    status: MethodologyPreviewStatus;

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
            'Звонок ещё не разобран: проверка идёт поверх готового разбора.',
        type: String,
        nullable: true,
    })
    error: string | null;

    @ApiProperty({
        description: 'Итог проверки; null — ещё не готово или отказ.',
        type: MethodologyPreviewResultDto,
        nullable: true,
    })
    result: MethodologyPreviewResultDto | null;

    @ApiProperty({
        description: 'Момент последнего изменения состояния, ISO.',
        example: '2026-11-16T11:05:12.000Z',
        type: String,
    })
    updatedAt: string;
}
