import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export type BitrixTranscriptionStatus =
    | 'started'
    | 'processing'
    | 'done'
    | 'error'
    | 'not_found';

export const BITRIX_TRANSCRIPTION_STATUS_VALUES = [
    'started',
    'processing',
    'done',
    'error',
    'not_found',
] as const satisfies readonly BitrixTranscriptionStatus[];

export class BitrixTranscriptionRequestDto {
    @ApiProperty({
        description:
            'Прямой URL аудиофайла, который нужно расшифровать. Должен быть доступен извне (например DOWNLOAD_URL из Bitrix24).',
        type: String,
        example:
            'https://april-garant.bitrix24.ru/bitrix/components/bitrix/disk.file.view/download.php?fileId=546068',
    })
    @IsString()
    @IsNotEmpty()
    fileUrl: string;

    @ApiProperty({
        description: 'Имя файла, используется в логах и для расшифровки.',
        type: String,
        example: 'call_893310_546068.mp3',
    })
    @IsString()
    @IsNotEmpty()
    fileName: string;

    @ApiProperty({
        description:
            'ID пользователя Bitrix24, который инициировал транскрибацию.',
        type: String,
        example: '1',
    })
    @IsString()
    @IsNotEmpty()
    userId: string;

    @ApiProperty({
        description: 'Имя пользователя Bitrix24 (для логов и истории).',
        type: String,
        example: 'Иван Иванов',
    })
    @IsString()
    @IsNotEmpty()
    userName: string;

    @ApiProperty({
        description: 'Имя приложения-источника (для группировки в истории).',
        type: String,
        example: 'event-sales',
    })
    @IsString()
    @IsNotEmpty()
    appName: string;

    @ApiProperty({
        description:
            'ID активности Bitrix24 (CRM activity), к которой относится файл.',
        type: String,
        example: '893310',
    })
    @IsString()
    @IsNotEmpty()
    activityId: string;

    @ApiProperty({
        description: 'ID файла в Bitrix24 Disk / FILES активности.',
        type: String,
        example: '546068',
    })
    @IsString()
    @IsNotEmpty()
    fileId: string;

    @ApiProperty({
        description:
            'Длительность аудиофайла в секундах (строкой, для совместимости с фронтом).',
        type: String,
        example: '120',
    })
    @IsString()
    @IsNotEmpty()
    duration: string;

    @ApiProperty({
        description:
            'Отдел или подразделение пользователя (для группировки в истории).',
        type: String,
        example: 'ОП',
    })
    @IsString()
    @IsNotEmpty()
    department: string;

    @ApiProperty({
        description:
            'Тип CRM-сущности (deal / lead / company), к которой привязан звонок.',
        type: String,
        example: 'deal',
    })
    @IsString()
    @IsNotEmpty()
    entityType: string;

    @ApiProperty({
        description: 'ID связанной CRM-сущности в Bitrix24.',
        type: String,
        example: '34792',
    })
    @IsString()
    @IsNotEmpty()
    entityId: string;

    @ApiProperty({
        description:
            'Имя CRM-сущности (название сделки / лида), для удобного отображения в истории.',
        type: String,
        example: 'ООО Ромашка',
    })
    @IsString()
    @IsNotEmpty()
    entityName: string;

    @ApiProperty({
        description: 'Домен портала Bitrix24, на котором лежит файл.',
        type: String,
        example: 'april-garant.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;
}

export class BitrixTranscriptionResponseDto {
    @ApiProperty({
        description:
            'ID задачи для опроса статуса транскрибации через GET /transcription-bitrix/:taskId.',
        type: String,
        example: 'bitrix_transcribe_1716468234567',
    })
    @IsString()
    taskId: string;

    @ApiProperty({
        description:
            'Текущий статус задачи: started (поставлена в очередь), processing (в работе), done (готово, есть text), error (ошибка), not_found (нет такой задачи или результат истёк).',
        type: String,
        enum: BITRIX_TRANSCRIPTION_STATUS_VALUES,
        example: 'done',
    })
    @IsString()
    @IsIn(BITRIX_TRANSCRIPTION_STATUS_VALUES as unknown as string[])
    status: BitrixTranscriptionStatus;

    @ApiPropertyOptional({
        description: 'Распознанный текст. Присутствует только при status=done.',
        type: String,
        example: 'Алло, добрый день. Это Иван из компании April...',
    })
    @IsOptional()
    @IsString()
    text?: string;

    @ApiPropertyOptional({
        description: 'Текст ошибки. Присутствует только при status=error.',
        type: String,
        example: 'Vibecode transcription failed [500]: ...',
    })
    @IsOptional()
    @IsString()
    error?: string;

    @ApiPropertyOptional({
        description:
            'ID записи в БД для долгосрочного хранения транскрипции (если используется store).',
        type: Number,
        example: 12345,
    })
    @IsOptional()
    @IsInt()
    transcriptionId?: number;
}
