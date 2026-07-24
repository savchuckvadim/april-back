import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

/** Запрос списка документов клиента по разделу. */
export class AiSettingsListQueryDto {
    @ApiProperty({
        description: 'Домен портала клиента (из списка своих порталов).',
        example: 'april-garant.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: 'Раздел базы знаний (kind).',
        example: 'call-classify',
        type: String,
    })
    @IsString()
    @Matches(/^[a-z][a-z0-9-]*$/, { message: 'kind: слаг вида call-classify' })
    kind: string;
}

/** Запрос одного документа клиента. */
export class AiSettingsDocumentQueryDto extends AiSettingsListQueryDto {
    @ApiProperty({
        description: 'Имя файла документа.',
        example: 'instruction.md',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    fileName: string;
}

/** Сохранение текстового документа клиента (upsert). */
export class AiSettingsUpsertDto {
    @ApiProperty({
        description: 'Домен портала клиента.',
        example: 'april-garant.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: 'Раздел базы знаний (kind).',
        example: 'call-classify',
        type: String,
    })
    @IsString()
    @Matches(/^[a-z][a-z0-9-]*$/, { message: 'kind: слаг вида call-classify' })
    kind: string;

    @ApiProperty({
        description:
            'Имя файла с расширением .md/.txt/.json; тот же fileName — перезапись.',
        example: 'instruction.md',
        type: String,
    })
    @IsString()
    @Matches(/^[\w.-]+\.(md|txt|json)$/i, {
        message: 'fileName: имя без путей, расширение .md/.txt/.json',
    })
    fileName: string;

    @ApiProperty({
        description: 'Содержимое документа.',
        example: '## Наши критерии холодного звонка...',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    content: string;
}

/** Портал клиента (для выбора домена в интерфейсе). */
export class AiSettingsPortalDto {
    @ApiProperty({ description: 'ID портала.', example: 5, type: Number })
    id: number;

    @ApiProperty({
        description: 'Домен портала.',
        example: 'april-garant.bitrix24.ru',
        type: String,
    })
    domain: string;
}

/** Документ клиента в списке. */
export class AiSettingsDocumentDto {
    @ApiProperty({
        description: 'Имя файла.',
        example: 'instruction.md',
        type: String,
    })
    fileName: string;

    @ApiProperty({
        description: 'Раздел (kind).',
        example: 'call-classify',
        type: String,
    })
    kind: string;

    @ApiProperty({
        description:
            'Источник: домен портала (клиентский документ) или shared ' +
            '(общий материал April — только чтение).',
        example: 'april-garant.bitrix24.ru',
        type: String,
    })
    source: string;

    @ApiProperty({
        description:
            'true — документ клиента (можно редактировать/удалять); ' +
            'false — общий материал (только чтение).',
        example: true,
        type: Boolean,
    })
    editable: boolean;
}

/** Текст документа. */
export class AiSettingsDocumentContentDto extends AiSettingsDocumentDto {
    @ApiProperty({
        description: 'Извлечённый текст документа.',
        example: '## Наши критерии...',
        type: String,
    })
    text: string;
}

/** Результат сохранения/удаления. */
export class AiSettingsMutationResponseDto {
    @ApiProperty({ description: 'Успех операции.', example: true })
    success: boolean;

    @ApiProperty({
        description: 'Имя затронутого файла.',
        example: 'instruction.md',
        type: String,
    })
    fileName: string;
}
