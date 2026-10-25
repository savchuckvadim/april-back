import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    ContractSpecificationFormRequestDto,
    ContractSpecificationFormResponseDto,
} from '../dto/contract-specification-form.dto';
import { ContractSpecificationFormService } from '../services/contract-specification-form.service';

@ApiTags('KonstructorContract')
@Controller('contract')
export class ContractSpecificationFormController {
    constructor(private readonly service: ContractSpecificationFormService) {}

    @Post('specification-form')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Форма договора по сборке: общая часть и спецификация',
        description:
            'Замена Laravel konstruct/contract/init (getContractGeneralForm + getSpecification). ' +
            'Тексты поставки резолвятся на бэке по supply.code; спецификация уже отфильтрована ' +
            'по поставке, типу договора и типу клиента. Менеджер правит строки и отдаёт их в contract/generate.',
    })
    @ApiBody({ type: ContractSpecificationFormRequestDto })
    @ApiOkResponse({ type: ContractSpecificationFormResponseDto })
    async specificationForm(
        @Body() dto: ContractSpecificationFormRequestDto,
    ): Promise<ContractSpecificationFormResponseDto> {
        return this.service.build(dto);
    }
}
