import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
    IsEnum,
    IsInt,
    IsNumberString,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator';
import { ClientTypeEnum, SupplyTypeEnum } from './supply-report-template.enums';
import { IsBooleanFlag } from './is-boolean-flag.decorator';

/** Значение по умолчанию и потолок страницы. */
export const SUPPLY_REPORT_TEMPLATE_PAGE_SIZE = 50;
export const SUPPLY_REPORT_TEMPLATE_PAGE_SIZE_MAX = 200;

/**
 * Фильтры списка. Колонки `contract_type` у отчёта о поставке НЕТ
 * (она есть только у `contract_templates`), поэтому фильтра по типу
 * договора здесь нет и быть не может.
 */
export class SupplyReportTemplateQueryDto {
    @ApiPropertyOptional({
        description: 'Фильтр по порталу. Не передан — без фильтра по порталу.',
        type: String,
        example: '7',
    })
    @IsOptional()
    @IsNumberString()
    portal_id?: string;

    @ApiPropertyOptional({
        description:
            'Показывать только общие шаблоны (portal_id IS NULL). ' +
            'Нужен отдельным флагом, потому что «нет фильтра» и «только общие» — разные запросы.',
        example: true,
    })
    @IsOptional()
    @IsBooleanFlag()
    only_common?: boolean;

    @ApiPropertyOptional({
        description: 'Фильтр по поставщику (agents.id).',
        type: String,
        example: '42',
    })
    @IsOptional()
    @IsNumberString()
    agent_id?: string;

    @ApiPropertyOptional({
        description:
            'Фильтр по типу клиента. Совпадение считается в TypeScript: ' +
            'список лежит JSON-ом в LongText, у Prisma нет операций по массивам ' +
            'в строковой колонке, а сырой SQL в проекте запрещён.',
        enum: ClientTypeEnum,
        enumName: 'ClientTypeEnum',
    })
    @IsOptional()
    @IsEnum(ClientTypeEnum)
    client_type?: ClientTypeEnum;

    @ApiPropertyOptional({
        description: 'Фильтр по типу поставки. Считается так же, в TypeScript.',
        enum: SupplyTypeEnum,
        enumName: 'SupplyTypeEnum',
    })
    @IsOptional()
    @IsEnum(SupplyTypeEnum)
    supply_type?: SupplyTypeEnum;

    @ApiPropertyOptional({
        description: 'Фильтр по активности.',
        example: true,
    })
    @IsOptional()
    @IsBooleanFlag()
    is_active?: boolean;

    @ApiPropertyOptional({
        description: 'Фильтр по архивности. По умолчанию архивные скрыты.',
        example: false,
    })
    @IsOptional()
    @IsBooleanFlag()
    is_archived?: boolean;

    @ApiPropertyOptional({
        description: 'Поиск по названию, коду и описанию.',
        example: 'интернет',
    })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({
        description:
            'Сколько записей вернуть. Пагинация обязательна: у шаблонов счёта её нет, ' +
            'и список там не может обслуживать реальную таблицу админки.',
        minimum: 1,
        maximum: SUPPLY_REPORT_TEMPLATE_PAGE_SIZE_MAX,
        default: SUPPLY_REPORT_TEMPLATE_PAGE_SIZE,
    })
    @IsOptional()
    @Transform(({ value }: { value: unknown }) => Number(value))
    @IsInt()
    @Min(1)
    @Max(SUPPLY_REPORT_TEMPLATE_PAGE_SIZE_MAX)
    take?: number;

    @ApiPropertyOptional({
        description: 'Сколько записей пропустить.',
        minimum: 0,
        default: 0,
    })
    @IsOptional()
    @Transform(({ value }: { value: unknown }) => Number(value))
    @IsInt()
    @Min(0)
    skip?: number;
}
