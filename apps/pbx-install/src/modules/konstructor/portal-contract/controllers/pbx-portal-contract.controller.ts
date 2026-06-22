import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseIntPipe,
    Patch,
    Post,
} from '@nestjs/common';
import {
    ApiBody,
    ApiNoContentResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { GetPortalContractFormUseCase } from '../use-cases/get-portal-contract-form.use-case';
import { ManagePortalContractUseCase } from '../use-cases/manage-portal-contract.use-case';
import { PortalContractFormResponseDto } from '../dto/portal-contract-form-response.dto';
import { PortalContractResponseDto } from '../dto/portal-contract-response.dto';
import { CreatePortalContractDto } from '../dto/create-portal-contract.dto';
import { UpdatePortalContractDto } from '../dto/update-portal-contract.dto';

@ApiTags('PBX Portal Contract')
@Controller('pbx-portal-contract')
export class PbxPortalContractController {
    constructor(
        private readonly useCase: GetPortalContractFormUseCase,
        private readonly manageUseCase: ManagePortalContractUseCase,
    ) {}

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

    @ApiOperation({
        summary: 'Создать договор портала',
        description:
            'Создаёт `portal_contract` для портала (по `domain`). Связи ' +
            '(`contract_id`, `portal_measure_id`, `bitrixfield_item_id`) берутся ' +
            'из initial-данных формы.',
    })
    @ApiParam({ name: 'domain', description: 'Домен Bitrix-портала' })
    @ApiBody({ type: CreatePortalContractDto })
    @ApiOkResponse({ type: PortalContractResponseDto })
    @Post('/domain/:domain')
    async create(
        @Param('domain') domain: string,
        @Body() dto: CreatePortalContractDto,
    ): Promise<PortalContractResponseDto> {
        const created = await this.manageUseCase.createByDomain(domain, dto);
        return new PortalContractResponseDto(created);
    }

    @ApiOperation({
        summary: 'Обновить договор портала',
        description: 'Частично обновляет `portal_contract` по id.',
    })
    @ApiParam({ name: 'id', description: 'ID договора портала', type: Number })
    @ApiBody({ type: UpdatePortalContractDto })
    @ApiOkResponse({ type: PortalContractResponseDto })
    @Patch(':id')
    async update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdatePortalContractDto,
    ): Promise<PortalContractResponseDto> {
        const updated = await this.manageUseCase.update(id, dto);
        return new PortalContractResponseDto(updated);
    }

    @ApiOperation({
        summary: 'Удалить договор портала',
        description: 'Удаляет `portal_contract` по id.',
    })
    @ApiParam({ name: 'id', description: 'ID договора портала', type: Number })
    @ApiNoContentResponse({ description: 'Договор портала удалён' })
    @HttpCode(204)
    @Delete(':id')
    async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
        await this.manageUseCase.remove(id);
    }
}
