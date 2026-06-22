import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TemplateBaseEntity } from '@lib/portal-lib/konstructor';

/**
 * Шаблон конструктора (`templates`).
 *
 * Read-модель для фронта: список/детали шаблонов портала и результат
 * create/update. Все id сериализуются в number.
 */
export class TemplateBaseResponseDto {
    constructor(entity: TemplateBaseEntity) {
        this.id = Number(entity.id);
        this.name = entity.name;
        this.code = entity.code;
        this.type = entity.type ?? null;
        this.link = entity.link ?? null;
        this.portalId =
            entity.portalId != null ? Number(entity.portalId) : null;
        this.createdAt = entity.created_at;
        this.updatedAt = entity.updated_at;
    }

    @ApiProperty({ description: 'ID шаблона', example: 1, type: Number })
    id: number;

    @ApiProperty({
        description: 'Название шаблона',
        example: 'КП на поставку',
        type: String,
    })
    name: string;

    @ApiProperty({
        description: 'Символьный код шаблона (уникален в рамках портала)',
        example: 'offer_supply',
        type: String,
    })
    code: string;

    @ApiPropertyOptional({
        description: 'Тип шаблона (например offer/contract)',
        example: 'offer',
        type: String,
    })
    type?: string | null;

    @ApiPropertyOptional({
        description: 'Ссылка на исходный документ-шаблон',
        example: 'https://docs.example.com/template',
        type: String,
    })
    link?: string | null;

    @ApiPropertyOptional({
        description: 'ID портала-владельца шаблона',
        example: 7,
        type: Number,
    })
    portalId?: number | null;

    @ApiPropertyOptional({
        description: 'Дата создания записи',
        example: '2026-06-22T08:00:00.000Z',
        type: String,
    })
    createdAt?: Date | null;

    @ApiPropertyOptional({
        description: 'Дата последнего обновления записи',
        example: '2026-06-22T08:00:00.000Z',
        type: String,
    })
    updatedAt?: Date | null;
}
