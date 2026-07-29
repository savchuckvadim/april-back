import { ApiProperty } from '@nestjs/swagger';
import { IComplects } from '../services/init-complect.service';
import { IInfoblock, IInfoGroups } from '../services/init-infoblock.service';
import { RegionEntity } from '@lib/garant';
import { IComplect } from '../services/init-complect.service';
import { IKonstruktorInit } from '../konstructor-init.use-case';
import { ContractDto } from '../../dto/contract.dto';
import { IKServiceItem, IKServices } from '../services/init-services.service';

export class ComplectCodesDto {
    @ApiProperty({ description: 'Коды инфоблоков наполнения', type: [String] })
    filling: string[];
    @ApiProperty({ description: 'Коды ЭР', type: [String] })
    ers: string[];
    @ApiProperty({ description: 'Коды пакетов ЭР', type: [String] })
    packetsEr: string[];
    @ApiProperty({ description: 'Коды ЭР внутри пакетов', type: [String] })
    ersInPacket: string[];
}

export class InitComplectDto implements IComplect {
    @ApiProperty({ description: 'Id', type: Number })
    id: number;
    @ApiProperty({ description: 'Name', type: String })
    name: string;
    @ApiProperty({ description: 'Title', type: String })
    title: string;
    @ApiProperty({ description: 'Full Title', type: String })
    fullTitle: string;

    @ApiProperty({ description: 'Filling', type: [String] })
    filling: string[];
    @ApiProperty({ description: 'Ers', type: [Number] })
    ers: number[];
    @ApiProperty({ description: 'Packets Er', type: [Number] })
    packetsEr: number[];
    @ApiProperty({ description: 'Ers In Packet', type: [Number] })
    ersInPacket: number[];
    @ApiProperty({ description: 'Codes', type: ComplectCodesDto })
    codes: ComplectCodesDto;
    @ApiProperty({ description: 'Type', type: String })
    type: 'prof' | 'universal';
    @ApiProperty({ description: 'With Consalting', type: Boolean })
    withConsalting: boolean;
    @ApiProperty({ description: 'With ABS', type: Boolean })
    withABS: boolean;
    @ApiProperty({ description: 'With Lt', type: Boolean })
    withLt: boolean;
    @ApiProperty({ description: 'With Services', type: Boolean })
    withServices: boolean;
    @ApiProperty({
        description: 'Есть ли наполнение по умолчанию',
        type: Boolean,
    })
    withDefault: boolean;
    @ApiProperty({ description: 'Is Changing', type: Boolean })
    isChanging: boolean;
    @ApiProperty({
        description: 'Тип продукта (garant/lt/star/consalting)',
        type: String,
    })
    productType: string;

    @ApiProperty({ description: 'Short Title', type: String })
    shortTitle: string;
    @ApiProperty({ description: 'Tag', type: String })
    tag: string;
    @ApiProperty({ description: 'Class Name', type: String })
    className: string;
    @ApiProperty({
        description: 'Цвет комплекта из админки',
        type: String,
        nullable: true,
    })
    color: string | null;
    @ApiProperty({ description: 'Number', type: Number })
    number: number;
    @ApiProperty({ description: 'Weight', type: Number })
    weight: number;
    @ApiProperty({
        description:
            'База абонентского обслуживания (universal: цена = abs × region.abs × coefficient)',
        type: Number,
        nullable: true,
    })
    abs: number | null;
}
export class ComplectsDto implements IComplects {
    @ApiProperty({ description: 'Prof', type: [InitComplectDto] })
    prof: InitComplectDto[];
    @ApiProperty({ description: 'Universal', type: [InitComplectDto] })
    universal: InitComplectDto[];
}

export class InfoblockDto implements IInfoblock {
    @ApiProperty({ description: 'Id', type: Number })
    id: number;
    @ApiProperty({ description: 'Name', type: String })
    name: string;
    @ApiProperty({ description: 'Code', type: String })
    code: string;
    @ApiProperty({ description: 'Weight', type: Number })
    weight: number;
    @ApiProperty({ description: 'Infogroup Id', type: Number })
    infogroupId: number;
    @ApiProperty({ description: 'Infohroup Code', type: String })
    infohroupCode: string;
    @ApiProperty({ description: 'Infohroup Name', type: String })
    infohroupName: string;
    @ApiProperty({ description: 'Short Description', type: String })
    shortDescription: string;
    @ApiProperty({ description: 'Description', type: String })
    description: string;
    @ApiProperty({ description: 'Description For Sale', type: String })
    descriptionForSale: string;
    @ApiProperty({ description: 'Parent', type: [String] })
    parent: string[];
    @ApiProperty({ description: 'Children', type: [String] })
    children: string[];
    @ApiProperty({ description: 'Is Set', type: Boolean })
    isSet: boolean;
    @ApiProperty({ description: 'Is Free', type: Boolean })
    isFree: boolean;
    @ApiProperty({ description: 'Is La', type: Boolean })
    isLa: boolean;
}
export class InfoGroupsDto implements IInfoGroups {
    @ApiProperty({ description: 'Id', type: Number })
    id: number;
    @ApiProperty({ description: 'Code', type: String })
    code: string;
    @ApiProperty({ description: 'Group Name', type: String })
    groupName: string;
    @ApiProperty({ description: 'Type', type: String })
    type: string;
    @ApiProperty({ description: 'Product Type', type: String })
    productType: string;
    @ApiProperty({ description: 'Value', type: [InfoblockDto] })
    value: InfoblockDto[];
}

export class RegionInitDto implements RegionEntity {
    @ApiProperty({ description: 'Id', type: String })
    id: string;
    @ApiProperty({ description: 'Name', type: String })
    name: string;
    @ApiProperty({ description: 'Code', type: String })
    code: string;
    @ApiProperty({ description: 'Weight', type: Number })
    weight: number;

    @ApiProperty({ description: 'Number', type: Number })
    number: number;
    @ApiProperty({ description: 'Title', type: String })
    title: string;
    @ApiProperty({ description: 'Infoblock', type: String })
    infoblock: string;
    @ApiProperty({ description: 'Abs', type: Number })
    abs: number;
    @ApiProperty({ description: 'Tax', type: Number })
    tax: number;
    @ApiProperty({ description: 'Tax Abs', type: Number })
    tax_abs: number;
}

// export class ContractDto {
//     constructor(contract: PortalContractEntity) {
//         this.measureId = Number(contract.portal_measure?.id) || 0;
//         this.measureNumber = Number(contract.portal_measure?.measure_id) || 0;
//         this.discount = contract.contract?.discount || 0;
//         this.aprilName = contract.contract?.name || '';
//         this.measureName = contract.portal_measure?.name || '';
//         this.prepayment = contract.contract?.prepayment || 0;
//         this.itemId = Number(contract.bitrixfield_item_id) || 0;
//         this.number = contract.order || 0;
//         this.measureCode = Number(contract.portal_measure?.measure?.code) || 0;
//         this.bitrixName = contract.contract?.name || '';
//         this.shortName = contract.portal_measure?.shortName || '';
//         this.measureFullName = contract.portal_measure?.fullName || '';
//     }
//     @ApiProperty({ description: 'Measure ID', type: Number })
//     measureId: number;
//     @ApiProperty({ description: 'Measure Number', type: Number })
//     measureNumber: number;
//     @ApiProperty({ description: 'Discount', type: Number })
//     discount: number;
//     @ApiProperty({ description: 'April Name', type: String })
//     aprilName: string;
//     @ApiProperty({ description: 'Measure Name', type: String })
//     measureName: string;
//     @ApiProperty({ description: 'Prepayment', type: Number })
//     prepayment: number;
//     @ApiProperty({ description: 'Item ID', type: Number })
//     itemId: number;
//     @ApiProperty({ description: 'Number', type: Number })
//     number: number;
//     @ApiProperty({ description: 'Measure Code', type: Number })
//     measureCode: number;
//     @ApiProperty({ description: 'Bitrix Name', type: String })
//     bitrixName: string;
//     @ApiProperty({ description: 'Short Name', type: String })
//     shortName: string;
//     @ApiProperty({ description: 'Measure Full Name', type: String })
//     measureFullName: string;
//     @ApiProperty({ description: 'Order', type: Number })
//     order: number;

// }

export class ContractsDto {
    @ApiProperty({ description: 'Current', type: [Number] })
    current: number[];
    @ApiProperty({ description: 'Items', type: [ContractDto] })
    items: ContractDto[];
}

export class SupplyInitDto {
    @ApiProperty({ description: 'Id', type: Number })
    id: number;
    @ApiProperty({ description: 'Название', type: String })
    name: string;
    @ApiProperty({ description: 'Полное название', type: String })
    fullName: string;
    @ApiProperty({ description: 'Короткое название', type: String })
    shortName: string;
    @ApiProperty({ description: 'Код', type: String })
    code: string;
    @ApiProperty({
        description: 'Тип поставки (internet/proxima)',
        type: String,
    })
    type: string;
    @ApiProperty({
        description: 'Количество одновременных доступов (ОД)',
        type: Number,
    })
    usersQuantity: number;
    @ApiProperty({ description: 'Ценовой коэффициент', type: Number })
    coefficient: number;
    @ApiProperty({ description: 'Цвет', type: String, nullable: true })
    color: string | null;
    @ApiProperty({ description: 'Описание', type: String, nullable: true })
    description: string | null;
    @ApiProperty({
        description: 'Имя для продажи 1',
        type: String,
        nullable: true,
    })
    saleName_1: string | null;
    @ApiProperty({
        description: 'Имя для продажи 2',
        type: String,
        nullable: true,
    })
    saleName_2: string | null;
    @ApiProperty({
        description: 'Имя для продажи 3',
        type: String,
        nullable: true,
    })
    saleName_3: string | null;
}

export class PriceInitDto {
    @ApiProperty({ description: 'Id', type: Number })
    id: number;
    @ApiProperty({ description: 'Код цены', type: String })
    code: string;
    @ApiProperty({ description: 'Значение (руб/мес)', type: Number })
    value: number;
    @ApiProperty({ description: 'Спеццена', type: Boolean })
    isSpecial: boolean;
    @ApiProperty({ description: 'Скидка', type: Number, nullable: true })
    discount: number | null;
    @ApiProperty({
        description: 'Тип региона: 0 — регионы, 1 — Москва',
        type: String,
    })
    region_type: string;
    @ApiProperty({
        description: 'Тип поставки (internet/proxima)',
        type: String,
        nullable: true,
    })
    supply_type: string | null;
    @ApiProperty({ description: 'Код поставки', type: String, nullable: true })
    supply_code: string | null;
    @ApiProperty({ description: 'Код комплекта', type: String, nullable: true })
    complect_code: string | null;
    @ApiProperty({
        description: 'Код пакета (LT/сервисы)',
        type: String,
        nullable: true,
    })
    garant_package_code: string | null;
}

export class KServiceItemDto implements IKServiceItem {
    @ApiProperty({ description: 'Id', type: Number })
    id: number;
    @ApiProperty({ description: 'Код', type: String })
    code: string;
    @ApiProperty({ description: 'Название', type: String })
    name: string;
    @ApiProperty({ description: 'Полное название', type: String })
    fullName: string;
    @ApiProperty({ description: 'Короткое название', type: String })
    shortName: string;
    @ApiProperty({ description: 'Номер', type: Number })
    number: number;
    @ApiProperty({ description: 'Вес', type: Number })
    weight: number;
    @ApiProperty({
        description: 'База абонентского обслуживания',
        type: Number,
        nullable: true,
    })
    abs: number | null;
    @ApiProperty({ description: 'Цвет', type: String, nullable: true })
    color: string | null;
    @ApiProperty({
        description: 'Тип продукта (lt/star/consalting)',
        type: String,
    })
    productType: string;
    @ApiProperty({ description: 'Из garant_packages (пакет)', type: Boolean })
    isPackage: boolean;
}

export class ServicesInitDto implements IKServices {
    @ApiProperty({
        description: 'Продукты Legal Tech',
        type: [KServiceItemDto],
    })
    lt: KServiceItemDto[];
    @ApiProperty({ description: 'Пакеты Legal Tech', type: [KServiceItemDto] })
    ltPackages: KServiceItemDto[];
    @ApiProperty({ description: 'Консалтинг', type: [KServiceItemDto] })
    consalting: KServiceItemDto[];
    @ApiProperty({ description: 'СТАР', type: [KServiceItemDto] })
    star: KServiceItemDto[];
}

export class KonstructorInitDataDto implements IKonstruktorInit {
    @ApiProperty({ description: 'Complects', type: ComplectsDto })
    complects: ComplectsDto;
    @ApiProperty({ description: 'Infoblocks', type: [InfoGroupsDto] })
    infoblocks: InfoGroupsDto[];
    @ApiProperty({ description: 'Regions', type: [RegionInitDto] })
    regions: RegionInitDto[];
    @ApiProperty({ description: 'Contracts', type: ContractsDto })
    contracts: ContractsDto;
    @ApiProperty({ description: 'Виды поставки (ОД)', type: [SupplyInitDto] })
    supplies: SupplyInitDto[];
    @ApiProperty({
        description: 'Прайс-таблица (code-джойны)',
        type: [PriceInitDto],
    })
    prices: PriceInitDto[];
    @ApiProperty({
        description: 'Дополнительные сервисы (LT/консалтинг/СТАР)',
        type: ServicesInitDto,
    })
    services: ServicesInitDto;
}
