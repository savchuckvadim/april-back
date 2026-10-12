import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    CONTRACT_LTYPE,
    ClientTypeEnum,
    SupplyTypeEnum,
} from './contract-template.enums';
import {
    parseClientTypes,
    parseSupplyTypes,
} from '@lib/portal-lib/konstructor/document-template';

/** Строка `contract_templates` в том виде, в котором её отдаёт Prisma. */
export type ContractTemplateLike = {
    id: bigint;
    name: string;
    code: string;
    contract_type: string;
    client_types: string | null;
    supply_types: string | null;
    description: string | null;
    file_path: string;
    demo_path: string | null;
    is_default: boolean;
    is_active: boolean;
    is_archived: boolean;
    archived_at: Date | null;
    portal_id: bigint | null;
    agent_id: bigint | null;
    creator_bitrix_user_id: bigint | null;
    created_at: Date | null;
    updated_at: Date | null;
};

export class ContractTemplateResponseDto {
    @ApiProperty({
        description: 'ID шаблона. Строка, т.к. BigInt не сериализуется в JSON.',
        type: String,
        example: '42',
    })
    id: string;

    @ApiProperty({ description: 'Название шаблона.' })
    name: string;

    @ApiProperty({ description: 'Технический код, генерируется при создании.' })
    code: string;

    @ApiProperty({
        description: 'Тип договора.',
        enum: CONTRACT_LTYPE,
        enumName: 'CONTRACT_LTYPE',
    })
    contract_type: CONTRACT_LTYPE;

    @ApiProperty({
        description: 'Типы клиента; null — «для любого».',
        enum: ClientTypeEnum,
        enumName: 'ClientTypeEnum',
        isArray: true,
        nullable: true,
    })
    client_types: ClientTypeEnum[] | null;

    @ApiProperty({
        description: 'Типы поставки; null — «для любого».',
        enum: SupplyTypeEnum,
        enumName: 'SupplyTypeEnum',
        isArray: true,
        nullable: true,
    })
    supply_types: SupplyTypeEnum[] | null;

    @ApiPropertyOptional({ description: 'Описание.', nullable: true })
    description?: string | null;

    @ApiProperty({ description: 'Шаблон по умолчанию в своей области.' })
    is_default: boolean;

    @ApiProperty({ description: 'Активен ли шаблон.' })
    is_active: boolean;

    @ApiProperty({ description: 'В архиве ли шаблон.' })
    is_archived: boolean;

    @ApiPropertyOptional({
        description: 'Когда отправлен в архив.',
        nullable: true,
    })
    archived_at?: Date | null;

    @ApiProperty({
        description: 'ID портала; null — общий шаблон.',
        type: String,
        nullable: true,
        example: '7',
    })
    portal_id: string | null;

    @ApiProperty({
        description: 'ID поставщика; null — для любого поставщика.',
        type: String,
        nullable: true,
        example: '42',
    })
    agent_id: string | null;

    @ApiProperty({
        description: 'ID создателя в Битрикс.',
        type: String,
        nullable: true,
    })
    creator_bitrix_user_id: string | null;

    @ApiPropertyOptional({ description: 'Когда создан.', nullable: true })
    created_at?: Date | null;

    @ApiPropertyOptional({ description: 'Когда изменён.', nullable: true })
    updated_at?: Date | null;

    @ApiProperty({ description: 'Ссылка на скачивание файла шаблона.' })
    template_url: string;

    @ApiPropertyOptional({
        description: 'Ссылка на демонстрационный файл, если он загружен.',
        nullable: true,
    })
    demo_url?: string | null;

    /**
     * ВСЕ bigint приводятся к строке: BigInt не сериализуется в JSON, и
     * глобальный ResponseInterceptor упал бы на первом же GET.
     */
    static fromEntity(
        row: ContractTemplateLike,
        templateUrl: string,
        demoUrl: string | null,
    ): ContractTemplateResponseDto {
        const dto = new ContractTemplateResponseDto();
        dto.id = String(row.id);
        dto.name = row.name;
        dto.code = row.code;
        dto.contract_type = row.contract_type as CONTRACT_LTYPE;
        dto.client_types = parseClientTypes(row.client_types);
        dto.supply_types = parseSupplyTypes(row.supply_types);
        dto.description = row.description;
        dto.is_default = row.is_default;
        dto.is_active = row.is_active;
        dto.is_archived = row.is_archived;
        dto.archived_at = row.archived_at;
        dto.portal_id = row.portal_id != null ? String(row.portal_id) : null;
        dto.agent_id = row.agent_id != null ? String(row.agent_id) : null;
        dto.creator_bitrix_user_id =
            row.creator_bitrix_user_id != null
                ? String(row.creator_bitrix_user_id)
                : null;
        dto.created_at = row.created_at;
        dto.updated_at = row.updated_at;
        dto.template_url = templateUrl;
        dto.demo_url = demoUrl;
        return dto;
    }
}

/** Страница списка: без total реальная таблица в админке не построится. */
export class ContractTemplatePageDto {
    @ApiProperty({ type: [ContractTemplateResponseDto] })
    items: ContractTemplateResponseDto[];

    @ApiProperty({ description: 'Всего записей под фильтр.', example: 12 })
    total: number;

    @ApiProperty({ description: 'Сколько записей запрошено.', example: 50 })
    take: number;

    @ApiProperty({ description: 'Сколько записей пропущено.', example: 0 })
    skip: number;
}
