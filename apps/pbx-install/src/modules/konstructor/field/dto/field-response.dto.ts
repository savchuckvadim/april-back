import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FieldEntity } from '@lib/portal-lib/konstructor';

/**
 * Поле конструктора (`fields`).
 *
 * Read-модель для фронта: список/детали полей и результат create/update.
 * Все id сериализуются в number.
 */
export class FieldResponseDto {
    constructor(entity: FieldEntity) {
        this.id = Number(entity.id);
        this.number = entity.number;
        this.name = entity.name;
        this.code = entity.code;
        this.type = entity.type;
        this.isGeneral = entity.isGeneral;
        this.isDefault = entity.isDefault;
        this.isRequired = entity.isRequired;
        this.value = entity.value;
        this.description = entity.description;
        this.bitixId = entity.bitixId;
        this.bitrixTemplateId = entity.bitrixTemplateId;
        this.isActive = entity.isActive;
        this.isPlural = entity.isPlural;
        this.createdAt = entity.created_at;
        this.updatedAt = entity.updated_at;
    }

    @ApiProperty({ description: 'ID поля', example: 1, type: Number })
    id: number;

    @ApiProperty({
        description: 'Порядковый номер поля в шаблоне',
        example: 1,
        type: Number,
    })
    number: number;

    @ApiProperty({
        description: 'Название поля',
        example: 'Наименование товара',
        type: String,
    })
    name: string;

    @ApiProperty({
        description: 'Символьный код поля',
        example: 'product_name',
        type: String,
    })
    code: string;

    @ApiPropertyOptional({
        description: 'Тип поля',
        example: 'string',
        type: String,
    })
    type?: string | null;

    @ApiProperty({
        description: 'Поле является общим (используется во всех шаблонах)',
        example: false,
        type: Boolean,
    })
    isGeneral: boolean;

    @ApiProperty({
        description: 'Поле подставляется по умолчанию',
        example: false,
        type: Boolean,
    })
    isDefault: boolean;

    @ApiProperty({
        description: 'Поле обязательно к заполнению',
        example: true,
        type: Boolean,
    })
    isRequired: boolean;

    @ApiPropertyOptional({
        description: 'Значение поля по умолчанию',
        example: 'Товар',
        type: String,
    })
    value?: string | null;

    @ApiPropertyOptional({
        description: 'Описание поля',
        example: 'Отображаемое наименование позиции',
        type: String,
    })
    description?: string | null;

    @ApiPropertyOptional({
        description: 'ID соответствующего пользовательского поля в Bitrix',
        example: 'UF_CRM_123',
        type: String,
    })
    bitixId?: string | null;

    @ApiPropertyOptional({
        description: 'ID шаблона Bitrix, к которому относится поле',
        example: '45',
        type: String,
    })
    bitrixTemplateId?: string | null;

    @ApiProperty({
        description: 'Поле активно',
        example: true,
        type: Boolean,
    })
    isActive: boolean;

    @ApiProperty({
        description: 'Поле множественное (может иметь несколько значений)',
        example: false,
        type: Boolean,
    })
    isPlural: boolean;

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
