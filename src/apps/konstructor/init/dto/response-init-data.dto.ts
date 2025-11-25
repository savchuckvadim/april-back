import { ApiProperty } from "@nestjs/swagger";
import { IComplects } from "../services/init-complect.service";
import { IInfoblock, IInfoGroups } from "../services/init-infoblock.service";
import { RegionEntity } from "@/modules/garant";
import { IComplect } from "../services/init-complect.service";
import { IKonstruktorInit } from "../konstructor-init.use-case";
import { ProductRowContractDto } from "../../document-generate";
import { ContractDto } from "../../dto/contract.dto";


export class ComplectDto implements IComplect {
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
    @ApiProperty({ description: 'Codes', type: [String] })
    codes: {
        filling: string[];
        ers: string[];
        packetsEr: string[];
        ersInPacket: string[];
    };
    @ApiProperty({ description: 'Type', type: String })
    type: 'prof' | 'universal';
    @ApiProperty({ description: 'With Consalting', type: Boolean })
    withConsalting: boolean;
    @ApiProperty({ description: 'Is Changing', type: Boolean })
    isChanging: boolean;

    @ApiProperty({ description: 'Short Title', type: String })
    shortTitle: string;
    @ApiProperty({ description: 'Tag', type: String })
    tag: string;
    @ApiProperty({ description: 'Class Name', type: String })
    className: string;
    @ApiProperty({ description: 'Number', type: Number })
    number: number;
    @ApiProperty({ description: 'Weight', type: Number })
    weight: number;
}
export class ComplectsDto implements IComplects {
    @ApiProperty({ description: 'Prof', type: [ComplectDto] })
    prof: ComplectDto[];
    @ApiProperty({ description: 'Universal', type: [ComplectDto] })
    universal: ComplectDto[];
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
export class KonstructorInitDataDto implements IKonstruktorInit {
    @ApiProperty({ description: 'Complects', type: ComplectsDto })
    complects: ComplectsDto;
    @ApiProperty({ description: 'Infoblocks', type: [InfoGroupsDto] })
    infoblocks: InfoGroupsDto[];
    @ApiProperty({ description: 'Regions', type: [RegionEntity] })
    regions: RegionEntity[];
    @ApiProperty({ description: 'Contracts', type: ContractsDto})
    contracts: ContractsDto;


}
