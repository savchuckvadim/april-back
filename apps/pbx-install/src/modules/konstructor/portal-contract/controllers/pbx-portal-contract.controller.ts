import { Controller, Get, Param } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { GetPortalContractFormUseCase } from '../use-cases/get-portal-contract-form.use-case';
import { PortalContractFormResponseDto } from '../dto/portal-contract-form-response.dto';
import { PortalContractResponseDto } from '../dto/portal-contract-response.dto';

@ApiTags('PBX Portal Contract')
@Controller('pbx-portal-contract')
export class PbxPortalContractController {
    constructor(private readonly useCase: GetPortalContractFormUseCase) {}

    @ApiOperation({
        summary: 'Initial-данные формы создания договора портала',
        description:
            'Возвращает select-опции для relation-полей формы создания ' +
            '`portal_contract`: порталы, глобальные договоры, портальные единицы ' +
            'измерения и items поля `contract_type` сделки портала.',
    })
    @ApiParam({ name: 'domain', description: 'Домен Bitrix-портала' })
    @ApiOkResponse({ type: PortalContractFormResponseDto })
    @Get('/form/domain/:domain')
    async getForm(
        @Param('domain') domain: string,
    ): Promise<PortalContractFormResponseDto> {
        const form = await this.useCase.getFormByDomain(domain);
        return new PortalContractFormResponseDto(form);
    }

    @ApiOperation({
        summary: 'Список договоров портала',
        description: 'Возвращает `portal_contracts` портала (по `domain`).',
    })
    @ApiParam({ name: 'domain', description: 'Домен Bitrix-портала' })
    @ApiOkResponse({ type: [PortalContractResponseDto] })
    @Get('/domain/:domain')
    async list(
        @Param('domain') domain: string,
    ): Promise<PortalContractResponseDto[]> {
        const portalContracts = await this.useCase.listByDomain(domain);
        return portalContracts.map(c => new PortalContractResponseDto(c));
    }
}
