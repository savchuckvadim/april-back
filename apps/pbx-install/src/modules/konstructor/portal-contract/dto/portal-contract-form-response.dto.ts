import { ApiProperty } from '@nestjs/swagger';
import {
    ContractTypeItemOption,
    PortalContractFormData,
    SelectOption,
} from '@lib/portal-lib/konstructor';

/** Базовая опция select-а (id + подписи). */
export class SelectOptionDto implements SelectOption {
    @ApiProperty({ description: 'ID сущности', example: 1, type: Number })
    id: number;

    @ApiProperty({
        description: 'Наименование',
        example: 'Штука',
        type: String,
    })
    name: string;

    @ApiProperty({
        description: 'Подпись для отображения',
        example: 'Штука',
        type: String,
    })
    title: string;
}

/** Опция select-а поля `contract_type` (item bitrix-поля сделки). */
export class ContractTypeItemOptionDto
    extends SelectOptionDto
    implements ContractTypeItemOption
{
    @ApiProperty({
        description: 'Код item-а bitrix-поля',
        example: 'dogovor',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'ID значения в Bitrix',
        example: 101,
        type: Number,
    })
    bitrixId: number;
}

/**
 * Initial-данные формы создания `portal_contract`: select-опции для всех
 * relation-полей (аналог legacy `PortalContract::getForm`).
 */
export class PortalContractFormResponseDto implements PortalContractFormData {
    constructor(data: PortalContractFormData) {
        this.portals = data.portals;
        this.contracts = data.contracts;
        this.portalMeasures = data.portalMeasures;
        this.contractTypeItems = data.contractTypeItems;
    }

    @ApiProperty({
        description: 'Доступные порталы (relation portal_id)',
        type: [SelectOptionDto],
    })
    portals: SelectOption[];

    @ApiProperty({
        description: 'Глобальные виды договоров (relation contract_id)',
        type: [SelectOptionDto],
    })
    contracts: SelectOption[];

    @ApiProperty({
        description:
            'Портальные единицы измерения данного портала (relation portal_measure_id)',
        type: [SelectOptionDto],
    })
    portalMeasures: SelectOption[];

    @ApiProperty({
        description:
            'Items поля contract_type сделки портала (relation bitrixfield_item_id)',
        type: [ContractTypeItemOptionDto],
    })
    contractTypeItems: ContractTypeItemOption[];
}
