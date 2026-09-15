import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsDefined,
    IsEnum,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import {
    ProductRowDto,
    ProductRowSetDto,
    ProductRowSupplyDto,
    PriceDto,
    RegionDto,
    RegionsDto,
    ComplectDto,
} from '@app/konstructor/document-generate';
//
import { ClientTypeEnum } from '../../document-generate/type/client.type';
import { BxRqDto } from '../../document-generate/dto/bx-rq/bx-rq.dto';
import { ContractSpecificationDto } from '../../document-generate/dto/specification/specification.dto';
import { CONTRACT_LTYPE } from '../../document-generate/type/contract.type';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContractDto } from '../../dto/contract.dto';
import {
    ConsaltingPayload,
    ContractProviderStatePayload,
    SupplyReportContactPayload,
    SupplyReportFormPayloadItem,
} from '../lib/supply-report-payload.type';

class PlacementDto {
    @ApiProperty({ description: 'Placement of the contract' })
    @IsString()
    placement: string;
    @ApiProperty({ description: 'Options of the placement', type: Object })
    @IsObject()
    options: { ID: number };
}

/** Тип клиента в виде, в котором его шлёт легаси-конструктор (SelectItem). */
export class ClientTypeSelectDto {
    @ApiPropertyOptional({ type: Number, example: 0 })
    @IsOptional()
    @IsNumber()
    id?: number;

    @ApiProperty({
        type: String,
        enum: ClientTypeEnum,
        example: ClientTypeEnum.ORG,
        description: 'Код типа клиента — по нему и работает генерация.',
    })
    @IsString()
    code: string;

    @ApiPropertyOptional({ type: String, example: 'Организация Коммерческая' })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({ type: String, example: 'Организация Коммерческая' })
    @IsOptional()
    @IsString()
    title?: string;
}

export class DocumentSupplyReportGenerateDto {
    @ApiProperty({ description: 'Domain of the company' })
    @IsString()
    domain: string;

    @ApiProperty({ description: 'ID of the company' })
    @IsString()
    companyId: string;

    @ApiProperty({ description: 'Placement of the contract' })
    @ValidateNested()
    @Type(() => PlacementDto)
    placement: PlacementDto;

    @ApiProperty({ description: 'Is the contract a product' })
    @IsBoolean()
    isProd: boolean;

    @ApiProperty({ description: 'ID of the deal' })
    @IsString()
    dealId: string;

    @ApiProperty({ description: 'ID of the provider' })
    @IsNumber()
    providerId: number;

    @ApiProperty({ description: 'ID of the user' })
    @IsNumber()
    userId: number;

    @ApiProperty({
        description: 'Type of the contract',
        enum: CONTRACT_LTYPE,
    })
    @IsEnum(CONTRACT_LTYPE)
    contractType: CONTRACT_LTYPE;

    @ApiProperty({
        description: 'Complect of the contract',
        type: [ComplectDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ComplectDto)
    complect: ComplectDto[];

    @ApiProperty({
        description: 'Supply of the contract',
        type: ProductRowSupplyDto,
    })
    @ValidateNested()
    @Type(() => ProductRowSupplyDto)
    supply: ProductRowSupplyDto;

    @ApiPropertyOptional({
        description:
            'Цены оффера. Легаси-конструктор это поле не шлёт, поэтому обязательным его делать нельзя — иначе весь запрос отвалится с 400 ещё до сервиса.',
        type: PriceDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => PriceDto)
    price?: PriceDto;

    @ApiProperty({ description: 'Contract of the contract', type: ContractDto })
    @ValidateNested()
    @Type(() => ContractDto)
    contract: ContractDto;

    @ApiProperty({ description: 'Regions of the contract', type: RegionsDto })
    @ValidateNested()
    @Type(() => RegionsDto)
    regions: RegionsDto;

    @ApiProperty({ description: 'Region of the contract', type: RegionDto })
    @ValidateNested()
    @Type(() => RegionDto)
    region: RegionDto;

    @ApiProperty({ description: 'Rows of the contract', type: [ProductRowDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto)
    rows: ProductRowDto[];

    @ApiProperty({ description: 'Total of the contract', type: ProductRowDto })
    @ValidateNested()
    @Type(() => ProductRowDto)
    total: ProductRowDto;

    @ApiProperty({
        description: 'Product set of the contract',
        type: ProductRowSetDto,
    })
    @ValidateNested()
    @Type(() => ProductRowSetDto)
    productSet: ProductRowSetDto;

    @ApiProperty({ description: 'Contract start of the contract' })
    @IsOptional()
    @IsString()
    contractStart?: string;

    @ApiProperty({ description: 'Contract end of the contract' })
    @IsOptional()
    @IsString()
    contractEnd?: string;

    @ApiProperty({ description: 'Contract number of the contract' })
    @IsOptional()
    @IsString()
    contractNumber?: string;

    @ApiProperty({ description: 'Contract create date of the contract' })
    @IsOptional()
    @IsString()
    contractCreateDate?: string;

    @ApiProperty({ description: 'Garant client assigned name of the contract' })
    @IsOptional()
    @IsString()
    garantClientAssignedName?: string;

    @ApiProperty({
        description: 'Garant client assigned email of the contract',
    })
    @IsOptional()
    @IsString()
    garantClientEmail?: string;

    @ApiProperty({ description: 'First pay date of the contract' })
    @IsOptional()
    @IsString()
    firstPayDate?: string;

    @ApiProperty({
        description:
            'Тип клиента. Легаси-конструктор шлёт объект SelectItem {id, code, name, title}, ветка IS_BACK и новый фронт — строку-код. Принимаем обе формы, код достаём через resolveClientTypeCode.',
        oneOf: [
            { type: 'string', enum: Object.values(ClientTypeEnum) },
            { $ref: '#/components/schemas/ClientTypeSelectDto' },
        ],
        example: { id: 0, code: 'org', name: 'Организация Коммерческая' },
    })
    @IsDefined()
    clientType: ClientTypeEnum | ClientTypeSelectDto;

    @ApiProperty({ description: 'BxRQ of the contract', type: BxRqDto })
    @IsObject()
    bxrq: BxRqDto;

    @ApiProperty({
        description: 'Contract specification state of the contract',
        type: ContractSpecificationDto,
    })
    @ValidateNested()
    @Type(() => ContractSpecificationDto)
    contractSpecificationState: ContractSpecificationDto;

    @ApiProperty({
        description: 'Product rows (arows)',
        type: [ProductRowDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto)
    arows: ProductRowDto[];

    @ApiProperty({
        description:
            'Поля компании из битрикса, ключованные кодом поля pbx: {op_client_type: {current, field, items}, ...} — именно так их отдаёт formatBxCompanyState. Массив с item.key тоже принимаем ради ветки IS_BACK.',
        type: Object,
    })
    @IsDefined()
    bxCompanyItems: Record<string, unknown> | unknown[];

    @ApiProperty({
        description: 'Bitrix contacts',
        type: [Object],
    })
    @IsArray()
    @IsObject({ each: true })
    bxContacts: SupplyReportContactPayload[];

    @ApiProperty({
        description:
            'Поля сделки из битрикса, ключованные кодом поля pbx: {contract_start: {current, field}, ...}. Форма та же, что у bxCompanyItems.',
        type: Object,
    })
    @IsDefined()
    bxDealItems: Record<string, unknown> | unknown[];

    @ApiProperty({
        description:
            'Заполненная менеджером форма отчёта о поставке — те же 15 полей, что отдал init-form, со значениями.',
        type: [Object],
    })
    @IsArray()
    @IsObject({ each: true })
    supplyReport: SupplyReportFormPayloadItem[];

    @ApiProperty({
        description: 'Contract provider state',
        type: Object,
    })
    @IsObject()
    contractProviderState: ContractProviderStatePayload;

    @ApiProperty({
        description: 'Contract base state',
        type: Object,
    })
    @IsObject()
    contractBaseState: any;

    @ApiProperty({
        description: 'Contract client state',
        type: Object,
    })
    @IsObject()
    contractClientState: any;

    @ApiProperty({
        description: 'Consalting data',
        type: Object,
        required: false,
    })
    @IsOptional()
    @IsObject()
    consalting?: ConsaltingPayload;

    @ApiProperty({
        description: 'Document price',
        type: Object,
        required: false,
    })
    @IsOptional()
    @IsObject()
    documentPrice?: any;

    // === Поля легаси-payload’а konstruct/supply ===
    // whitelist: true молча срезает всё необъявленное, поэтому то, что фронт
    // реально шлёт, объявлено здесь опциональным: часть уже используется, часть
    // нужна, чтобы не терять контекст при отладке и при переносе логики.

    @ApiPropertyOptional({
        type: String,
        description:
            'Id элемента RPA «Поставка», если отчёт делается из заявки. Пусто при облегчённом пути.',
    })
    @IsOptional()
    @IsString()
    rpa_id?: string;

    @ApiPropertyOptional({
        type: Boolean,
        description: 'Показывать ли набор товаров в документе.',
    })
    @IsOptional()
    @IsBoolean()
    isSetShow?: boolean;

    @ApiPropertyOptional({
        type: Boolean,
        description: 'Признак генерации счёта вместе с отчётом.',
    })
    @IsOptional()
    @IsBoolean()
    isInvoice?: boolean;

    @ApiPropertyOptional({
        type: Boolean,
        description: 'Публичный документ (без реквизитов).',
    })
    @IsOptional()
    @IsBoolean()
    isPublic?: boolean;

    @ApiPropertyOptional({
        type: Boolean,
        description:
            'Признак отчёта о поставке. Легаси шлёт его вместе с supplyReport.',
    })
    @IsOptional()
    @IsBoolean()
    isSupplyReport?: boolean;

    @ApiPropertyOptional({
        type: Boolean,
        description:
            'Дёргать ли внешний хук full/contract/flow. На бэке не используется — хук шлёт сам фронт.',
    })
    @IsOptional()
    @IsBoolean()
    withHook?: boolean;

    @ApiPropertyOptional({
        type: Object,
        description: 'Менеджер отдела продаж, как его собрал конструктор.',
    })
    @IsOptional()
    @IsObject()
    manager?: Record<string, unknown>;

    @ApiPropertyOptional({
        type: Object,
        description: 'Данные счёта.',
    })
    @IsOptional()
    @IsObject()
    invoice?: Record<string, unknown>;

    @ApiPropertyOptional({
        type: [Object],
        description: 'Продукты конструктора (ProductTypesEnum.GARANT).',
    })
    @IsOptional()
    @IsArray()
    products?: Record<string, unknown>[];

    @ApiPropertyOptional({
        type: Object,
        description: 'Состояние блока LegalTech.',
    })
    @IsOptional()
    @IsObject()
    legalTech?: Record<string, unknown>;

    @ApiPropertyOptional({
        type: Object,
        description: 'Текущий комплект конструктора.',
    })
    @IsOptional()
    @IsObject()
    currentComplect?: Record<string, unknown>;

    @ApiPropertyOptional({
        type: String,
        description:
            'Пустые заглушки легаси-payload’а: фронт шлёт document/link/file пустыми строками и заполняет их уже нашим ответом.',
    })
    @IsOptional()
    @IsString()
    document?: string;

    @ApiPropertyOptional({ type: String, description: 'См. document.' })
    @IsOptional()
    @IsString()
    link?: string;

    @ApiPropertyOptional({ type: String, description: 'См. document.' })
    @IsOptional()
    @IsString()
    file?: string;
}
