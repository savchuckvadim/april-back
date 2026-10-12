import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    parseClientTypes,
    parseSupplyTypes,
    parseTemplateListStrict,
} from '@lib/portal-lib/konstructor/document-template';
import { ClientTypeEnum, SupplyTypeEnum } from './supply-report-template.enums';
import { SUPPLY_REPORT_FIELD_CODES } from '../lib/supply-report-field-codes';

/**
 * Строка `supply_report_templates` в том виде, в котором её отдаёт Prisma.
 *
 * Колонки `contract_type` здесь НЕТ — она есть только у `contract_templates`.
 */
export type SupplyReportTemplateLike = {
    id: bigint;
    name: string;
    code: string;
    client_types: string | null;
    supply_types: string | null;
    required_fields: string | null;
    optional_fields: string | null;
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

/** Разбор списка кодов полей формы; null — «как в форме по умолчанию». */
function parseFieldCodes(raw: unknown): string[] | null {
    return parseTemplateListStrict(raw, SUPPLY_REPORT_FIELD_CODES).list;
}

export class SupplyReportTemplateResponseDto {
    @ApiProperty({
        description: 'ID шаблона. Строка, т.к. BigInt не сериализуется в JSON.',
        type: String,
        example: '42',
    })
    id: string;

    @ApiProperty({
        description: 'Название шаблона.',
        example: 'Отчёт о поставке, интернет',
    })
    name: string;

    @ApiProperty({
        description: 'Технический код, генерируется при создании.',
        example: 'supply-report-3f2a…',
    })
    code: string;

    @ApiProperty({
        description: 'Типы клиента; null — «для любого».',
        enum: ClientTypeEnum,
        enumName: 'ClientTypeEnum',
        isArray: true,
        nullable: true,
        example: [ClientTypeEnum.ORG_STATE],
    })
    client_types: ClientTypeEnum[] | null;

    @ApiProperty({
        description: 'Типы поставки; null — «для любого».',
        enum: SupplyTypeEnum,
        enumName: 'SupplyTypeEnum',
        isArray: true,
        nullable: true,
        example: [SupplyTypeEnum.INTERNET],
    })
    supply_types: SupplyTypeEnum[] | null;

    @ApiProperty({
        description:
            'Коды обязательных полей формы отчёта; null — «обязательность как в форме по умолчанию».',
        type: [String],
        nullable: true,
        example: ['sale_date', 'situation_comments'],
    })
    required_fields: string[] | null;

    @ApiProperty({
        description:
            'Коды необязательных полей формы отчёта; null — как в форме.',
        type: [String],
        nullable: true,
        example: ['invoice_number'],
    })
    optional_fields: string[] | null;

    @ApiPropertyOptional({
        description: 'Описание.',
        nullable: true,
        example: 'Редакция от 01.10.2026',
    })
    description?: string | null;

    @ApiProperty({
        description: 'Шаблон по умолчанию в своей области.',
        example: false,
    })
    is_default: boolean;

    @ApiProperty({ description: 'Активен ли шаблон.', example: true })
    is_active: boolean;

    @ApiProperty({ description: 'В архиве ли шаблон.', example: false })
    is_archived: boolean;

    @ApiPropertyOptional({
        description: 'Когда отправлен в архив.',
        nullable: true,
        example: '2026-10-12T09:00:00.000Z',
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
        example: '1',
    })
    creator_bitrix_user_id: string | null;

    @ApiPropertyOptional({
        description: 'Когда создан.',
        nullable: true,
        example: '2026-10-12T09:00:00.000Z',
    })
    created_at?: Date | null;

    @ApiPropertyOptional({
        description: 'Когда изменён.',
        nullable: true,
        example: '2026-10-12T09:30:00.000Z',
    })
    updated_at?: Date | null;

    @ApiProperty({
        description: 'Ссылка на скачивание файла шаблона.',
        example:
            'https://back.example.ru/api/supply-report-templates/42/download',
    })
    template_url: string;

    @ApiPropertyOptional({
        description: 'Ссылка на демонстрационный файл, если он загружен.',
        nullable: true,
        example:
            'https://back.example.ru/api/supply-report-templates/42/download?demo=1',
    })
    demo_url?: string | null;

    /**
     * ВСЕ bigint приводятся к строке: BigInt не сериализуется в JSON, и
     * глобальный ResponseInterceptor упал бы на первом же GET.
     */
    static fromEntity(
        row: SupplyReportTemplateLike,
        templateUrl: string,
        demoUrl: string | null,
    ): SupplyReportTemplateResponseDto {
        const dto = new SupplyReportTemplateResponseDto();
        dto.id = String(row.id);
        dto.name = row.name;
        dto.code = row.code;
        dto.client_types = parseClientTypes(row.client_types);
        dto.supply_types = parseSupplyTypes(row.supply_types);
        dto.required_fields = parseFieldCodes(row.required_fields);
        dto.optional_fields = parseFieldCodes(row.optional_fields);
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
export class SupplyReportTemplatePageDto {
    @ApiProperty({ type: [SupplyReportTemplateResponseDto] })
    items: SupplyReportTemplateResponseDto[];

    @ApiProperty({ description: 'Всего записей под фильтр.', example: 12 })
    total: number;

    @ApiProperty({ description: 'Сколько записей запрошено.', example: 50 })
    take: number;

    @ApiProperty({ description: 'Сколько записей пропущено.', example: 0 })
    skip: number;
}
