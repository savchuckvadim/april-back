import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

/**
 * Сохранение текстового документа базы знаний (редактор в админке):
 * без multipart — текст приходит JSON-полем и сохраняется как .md/.txt/.json.
 * Повторное сохранение с тем же fileName перезаписывает документ (upsert).
 */
export class KnowledgeTextUpsertDto {
    @ApiProperty({
        description:
            'Имя файла с расширением .md, .txt или .json (например ' +
            'instruction.md). Тот же fileName — перезапись документа.',
        example: 'instruction.md',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    @Matches(/^[\w.-]+\.(md|txt|json)$/i, {
        message:
            'fileName: имя без путей, расширение .md/.txt/.json (например instruction.md)',
    })
    fileName: string;

    @ApiProperty({
        description: 'Содержимое документа (plain text / markdown / JSON).',
        example: '## Критерии типа cold\n— менеджер впервые звонит...',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    content: string;

    @ApiPropertyOptional({
        description:
            'Домен портала — сохранить в клиентскую базу (перекрывает общую). ' +
            'Без домена — в общую базу.',
        example: 'april-garant.bitrix24.ru',
        type: String,
    })
    @IsOptional()
    @IsString()
    domain?: string;
}
