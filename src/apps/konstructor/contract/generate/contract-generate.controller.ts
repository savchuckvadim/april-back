import { Controller, Post, Body } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ContractGenerateService } from "./services/contract-generate.service";
import { ContractGenerateDto } from "./dto/contract-generate.dto";
import { ContractGenerateUseCase } from "./use-case/contract-generate.use-case";

@ApiTags('Konstructor')
@Controller('contract')
export class ContractGenerateController {
    constructor(private readonly contractUseCase: ContractGenerateUseCase) { }

    @Post('generate')
    async generateContract(@Body() dto: ContractGenerateDto) {
        return this.contractUseCase.getContract(dto);
    }

    // @Post('document')
    // async getDocument(@Body() dto: ContractGenerateDto) {
    //     return this.contractGenerateService.getDocument(dto);
    // }
}
