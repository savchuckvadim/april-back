import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Запись звонка из Bitrix-активностей компании (файл + метаданные). */
export class BxCallingRecordDto {
    @ApiProperty({
        description: 'Идентификатор файла записи в Bitrix.',
        type: Number,
        example: 101,
    })
    id: number;

    @ApiProperty({
        description: 'Название записи (из активности).',
        type: String,
        example: 'Звонок 01.07.2026',
    })
    name: string;

    @ApiProperty({
        description: 'URL аудиофайла записи.',
        type: String,
        example: 'https://portal.bitrix24.ru/disk/showFile/101/',
    })
    url: string;

    @ApiPropertyOptional({
        description: 'Длительность записи (если известна).',
        type: String,
        nullable: true,
        example: '1:23',
    })
    duration: string | null;

    @ApiProperty({
        description: 'Идентификатор активности Bitrix, к которой относится запись.',
        type: Number,
        example: 5501,
    })
    activityId: number;
}
