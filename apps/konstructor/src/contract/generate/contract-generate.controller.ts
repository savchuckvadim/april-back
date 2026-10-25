import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ContractGenerateDto } from './dto/contract-generate.dto';
import { ContractGenerateResponseDto } from './dto/contract-generate-response.dto';
import type { ContractGenerateResult } from './type/contract-generate.type';
import { ContractGenerateUseCase } from './use-case/contract-generate.use-case';

@ApiTags('Konstructor')
@Controller('contract')
export class ContractGenerateController {
    constructor(private readonly contractUseCase: ContractGenerateUseCase) {}

    @Post('generate')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сформировать договор',
        description:
            'Собирает DOCX договора по шаблону поставщика, кладёт ссылку в ' +
            'таймлайн компании и сделки. Один договор за вызов.',
    })
    @ApiBody({ type: ContractGenerateDto })
    @ApiOkResponse({
        type: ContractGenerateResponseDto,
        description: 'Ссылка на документ и данные, ушедшие в шаблон.',
    })
    async generateContract(
        @Body() dto: ContractGenerateDto,
    ): Promise<ContractGenerateResult> {
        return this.contractUseCase.getContract(dto);
    }
}
