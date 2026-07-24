import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

/** Запрос по домену портала клиента. */
export class AiSettingsDomainQueryDto {
    @ApiProperty({
        description: 'Домен портала клиента (из списка своих порталов).',
        example: 'april-garant.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;
}

/** Запрос списка документов клиента по разделу. */
export class AiSettingsListQueryDto extends AiSettingsDomainQueryDto {
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

/** Тип звонка из резолвленного реестра домена (клиентский вид). */
export class AiSettingsCallTypeDto {
    @ApiProperty({
        description: 'Код типа звонка (слаг).',
        example: 'cold',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Человеческое название типа.',
        example: 'Холодный звонок',
        type: String,
    })
    title: string;

    @ApiProperty({
        description: 'Что главное в звонке этого типа (фокус анализа).',
        example: 'Выход на ЛПР: проход секретаря, зацепка...',
        type: String,
    })
    focus: string;

    @ApiProperty({
        description:
            'Раздел базы знаний с инструкцией анализа именно этого типа.',
        example: 'call-analysis-cold',
        type: String,
    })
    knowledgeKind: string;
}

/** Итоговый реестр типов звонков домена. */
export class AiSettingsCallTypesResponseDto {
    @ApiProperty({
        description:
            'Источник реестра: builtin — только встроенные типы; ' +
            'knowledge — с учётом общих/клиентских документов.',
        example: 'knowledge',
        enum: ['builtin', 'knowledge'],
    })
    source: 'builtin' | 'knowledge';

    @ApiProperty({
        description: 'Типы звонков в порядке определения.',
        type: [AiSettingsCallTypeDto],
    })
    types: AiSettingsCallTypeDto[];
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
