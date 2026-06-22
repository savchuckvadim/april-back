import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { contracts } from 'generated/prisma';

/**
 * Глобальный вид договора (`contracts`).
 *
 * Read-only справочник. Для фронта — источник опций при выборе вида договора
 * и мастер-данные, на основе которых создаются `portal_contracts`.
 * Редактирование справочника — в admin.
 */
export class ContractResponseDto {
    constructor(contract: contracts) {
        this.id = Number(contract.id);
        this.name = contract.name;
        this.number = contract.number;
        this.title = contract.title;
        this.code = contract.code;
        this.type = contract.type;
        this.withPrepayment = contract.withPrepayment;
        this.template = contract.template;
        this.order = contract.order;
        this.coefficient = contract.coefficient;
        this.prepayment = contract.prepayment;
        this.discount = Number(contract.discount);
        this.productName = contract.productName;
        this.product = contract.product;
        this.service = contract.service;
        this.description = contract.description;
        this.comment = contract.comment;
        this.comment1 = contract.comment1;
        this.comment2 = contract.comment2;
        this.created_at = contract.created_at;
        this.updated_at = contract.updated_at;
    }

    @ApiProperty({ description: 'ID вида договора', example: 1, type: Number })
    id: number;

    @ApiProperty({
        description: 'Наименование',
        example: 'Поставка',
        type: String,
    })
    name: string;

    @ApiProperty({ description: 'Номер', example: 1, type: Number })
    number: number;

    @ApiProperty({
        description: 'Заголовок',
        example: 'Договор поставки',
        type: String,
    })
    title: string;

    @ApiProperty({ description: 'Код', example: 'SUPPLY', type: String })
    code: string;

    @ApiProperty({ description: 'Тип', example: 'base', type: String })
    type: string;

    @ApiProperty({ description: 'С предоплатой', example: true, type: Boolean })
    withPrepayment: boolean;

    @ApiPropertyOptional({
        description: 'Шаблон',
        example: 'template',
        type: String,
    })
    template?: string | null;

    @ApiPropertyOptional({ description: 'Порядок', example: 1, type: Number })
    order?: number | null;

    @ApiPropertyOptional({
        description: 'Коэффициент',
        example: 1,
        type: Number,
    })
    coefficient?: number;

    @ApiPropertyOptional({
        description: 'Предоплата',
        example: 1,
        type: Number,
    })
    prepayment?: number;

    @ApiPropertyOptional({ description: 'Скидка', example: 1.0, type: Number })
    discount?: number;

    @ApiPropertyOptional({
        description: 'Наименование продукта',
        example: 'Товар',
        type: String,
    })
    productName?: string | null;

    @ApiPropertyOptional({
        description: 'Продукт',
        example: 'Товар',
        type: String,
    })
    product?: string | null;

    @ApiPropertyOptional({
        description: 'Услуга',
        example: 'Услуга',
        type: String,
    })
    service?: string | null;

    @ApiPropertyOptional({
        description: 'Описание',
        example: 'Описание',
        type: String,
    })
    description?: string | null;

    @ApiPropertyOptional({
        description: 'Комментарий',
        example: 'Комментарий',
        type: String,
    })
    comment?: string | null;

    @ApiPropertyOptional({
        description: 'Комментарий 1',
        example: '...',
        type: String,
    })
    comment1?: string | null;

    @ApiPropertyOptional({
        description: 'Комментарий 2',
        example: '...',
        type: String,
    })
    comment2?: string | null;

    @ApiPropertyOptional({
        description: 'Дата создания',
        example: '2024-01-01T00:00:00.000Z',
    })
    created_at?: Date | null;

    @ApiPropertyOptional({
        description: 'Дата обновления',
        example: '2024-01-01T00:00:00.000Z',
    })
    updated_at?: Date | null;
}
