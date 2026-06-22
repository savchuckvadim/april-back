import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { ContractService } from '@lib/portal-lib/konstructor';
import { ContractResponseDto } from '../dto/contract-response.dto';

/**
 * Read-only доступ к глобальному справочнику видов договоров (`contracts`) из pbx-install.
 *
 * Для фронта: источник опций при выборе вида договора и мастер-данные для создания
 * `portal_contracts`. Редактирование справочника — в admin.
 */
@ApiTags('PBX Contract')
@Controller('pbx-contract')
export class PbxContractController {
    constructor(private readonly contractService: ContractService) {}

    @ApiOperation({
        summary: 'Список глобальных видов договоров',
        description: 'Справочник `contracts` целиком (read-only).',
    })
    @ApiOkResponse({ type: [ContractResponseDto] })
    @Get()
    async list(): Promise<ContractResponseDto[]> {
        const contracts = await this.contractService.findMany();
        return contracts.map(c => new ContractResponseDto(c));
    }

    @ApiOperation({
        summary: 'Вид договора по id',
        description: 'Одна запись справочника `contracts` (read-only).',
    })
    @ApiParam({ name: 'id', description: 'ID вида договора', type: Number })
    @ApiOkResponse({ type: ContractResponseDto })
    @Get(':id')
    async getById(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<ContractResponseDto> {
        const contract = await this.contractService.findById(id);
        return new ContractResponseDto(contract);
    }
}
