import { ApiProperty } from '@nestjs/swagger';
import { KnowledgeDocument } from '../domain/types/knowledge.type';
import { KnowledgeDocumentContent } from '../application/knowledge-content.service';

/** Документ базы знаний (метаданные без содержимого). */
export class KnowledgeDocumentDto
    implements Omit<KnowledgeDocument, 'absolutePath'>
{
    @ApiProperty({
        description: 'Имя файла документа внутри kind-папки.',
        example: 'skript-prezentacii.docx',
        type: String,
    })
    fileName: string;

    @ApiProperty({
        description: 'Kind-папка, из которой взят документ.',
        example: 'presentation',
        type: String,
    })
    kind: string;

    @ApiProperty({
        description:
            'Источник документа: shared (общая база) или домен портала.',
        example: 'april-garant.bitrix24.ru',
        type: String,
    })
    source: string;

    static fromDocument(document: KnowledgeDocument): KnowledgeDocumentDto {
        const dto = new KnowledgeDocumentDto();
        dto.fileName = document.fileName;
        dto.kind = document.kind;
        dto.source = document.source;
        return dto;
    }
}

/** Документ базы знаний с извлечённым текстом. */
export class KnowledgeDocumentContentDto
    extends KnowledgeDocumentDto
    implements KnowledgeDocumentContent
{
    @ApiProperty({
        description:
            'Извлечённый текст документа (PDF/DOCX/XLSX/TXT/MD → plain text).',
        example: 'Скрипт презентации: 1. Приветствие...',
        type: String,
    })
    text: string;

    static fromContent(
        content: KnowledgeDocumentContent,
    ): KnowledgeDocumentContentDto {
        const dto = new KnowledgeDocumentContentDto();
        dto.fileName = content.fileName;
        dto.kind = content.kind;
        dto.source = content.source;
        dto.text = content.text;
        return dto;
    }
}

/** Результат удаления документа базы знаний. */
/** Описание kind'а базы знаний для UI (реестр + фактические папки). */
export class KnowledgeKindInfoDto {
    @ApiProperty({
        description: 'Слаг kind (имя папки).',
        example: 'call-classify',
        type: String,
    })
    kind: string;

    @ApiProperty({
        description: 'Человеческое название для интерфейса.',
        example: 'Инструкция классификатора звонков',
        type: String,
    })
    title: string;

    @ApiProperty({
        description: 'Что лежит внутри и на что влияет.',
        example: 'Полностью замещает встроенную инструкцию классификатора.',
        type: String,
    })
    description: string;

    @ApiProperty({
        description: 'Кто читает материалы этого kind.',
        example: 'классификатор конвейера (tier-1, VibeCode)',
        type: String,
    })
    consumer: string;

    @ApiProperty({
        description:
            'true — kind из реестра известных; false — нестандартная папка, ' +
            'созданная загрузкой документа.',
        example: true,
        type: Boolean,
    })
    known: boolean;

    @ApiProperty({
        description: 'Есть ли уже документы в общей базе этого kind.',
        example: true,
        type: Boolean,
    })
    hasSharedDocuments: boolean;
}

export class KnowledgeDeleteResponseDto {
    @ApiProperty({
        description: 'Признак успешного удаления документа.',
        example: true,
        type: Boolean,
    })
    success: boolean;

    @ApiProperty({
        description: 'Имя удалённого файла.',
        example: 'skript-prezentacii.docx',
        type: String,
    })
    fileName: string;
}

/** Результат загрузки документа базы знаний. */
export class KnowledgeUploadResponseDto {
    @ApiProperty({
        description: 'Имя сохранённого файла.',
        example: 'skript-prezentacii.docx',
        type: String,
    })
    fileName: string;

    @ApiProperty({
        description: 'Kind-папка, в которую сохранён документ.',
        example: 'presentation',
        type: String,
    })
    kind: string;

    @ApiProperty({
        description: 'Куда сохранён документ: shared или домен портала.',
        example: 'april-garant.bitrix24.ru',
        type: String,
    })
    source: string;
}
