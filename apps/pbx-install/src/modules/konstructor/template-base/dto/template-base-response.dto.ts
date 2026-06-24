import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    TemplateBaseEntity,
    TemplateCounterEntity,
} from '@lib/portal-lib/konstructor';
import { FieldResponseDto } from '../../field/dto/field-response.dto';

/**
 * Pivot связи «шаблон ↔ счётчик» (`template_counter`) + данные счётчика.
 */
export class TemplateCounterDto {
    constructor(pivot: TemplateCounterEntity) {
        this.counterId = Number(pivot.counter_id);
        this.templateId = Number(pivot.template_id);
        this.name = pivot.counter?.name ?? null;
        this.title = pivot.counter?.title ?? null;
        this.value = pivot.value ?? null;
        this.prefix = pivot.prefix ?? null;
        this.day = pivot.day;
        this.year = pivot.year;
        this.month = pivot.month;
        this.count = pivot.count;
        this.size = pivot.size;
    }

    @ApiProperty({ description: 'ID счётчика', example: 1, type: Number })
    counterId: number;

    @ApiProperty({ description: 'ID шаблона', example: 1, type: Number })
    templateId: number;

    @ApiPropertyOptional({
        description: 'Системное имя счётчика',
        example: 'invoice_number',
        type: String,
    })
    name?: string | null;

    @ApiPropertyOptional({
        description: 'Человекочитаемое название счётчика',
        example: 'Номер счёта',
        type: String,
    })
    title?: string | null;

    @ApiPropertyOptional({
        description: 'Текущее значение счётчика в рамках шаблона',
        example: '0',
        type: String,
    })
    value?: string | null;

    @ApiPropertyOptional({
        description: 'Префикс номера',
        example: 'INV',
        type: String,
    })
    prefix?: string | null;

    @ApiProperty({
        description: 'Учитывать день',
        example: false,
        type: Boolean,
    })
    day: boolean;

    @ApiProperty({ description: 'Учитывать год', example: true, type: Boolean })
    year: boolean;

    @ApiProperty({
        description: 'Учитывать месяц',
        example: false,
        type: Boolean,
    })
    month: boolean;

    @ApiProperty({ description: 'Текущий счётчик', example: 0, type: Number })
    count: number;

    @ApiProperty({
        description: 'Размер числовой части номера',
        example: 1,
        type: Number,
    })
    size: number;
}

/**
 * Шаблон конструктора (`templates`).
 *
 * Read-модель для фронта: список/детали шаблонов портала и результат
 * create/update. Все id сериализуются в number. Включает связанные поля
 * (`template_field`) и счётчики (`template_counter`).
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
        this.fields = (entity.fields ?? []).map(f => new FieldResponseDto(f));
        this.counters = (entity.counters ?? []).map(
            c => new TemplateCounterDto(c),
        );
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

    @ApiProperty({
        description: 'Поля шаблона (`template_field`)',
        type: [FieldResponseDto],
    })
    fields: FieldResponseDto[];

    @ApiProperty({
        description: 'Счётчики шаблона (`template_counter`)',
        type: [TemplateCounterDto],
    })
    counters: TemplateCounterDto[];

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
