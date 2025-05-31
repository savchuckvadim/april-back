import { Controller, Post, Body } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ContractGenerateService } from "./contract-generate.service";
import { ContractGenerateDto } from "./contract-generate.dto";

@ApiTags('Konstructor')
@Controller('contract')
export class ContractGenerateController {
    constructor(private readonly contractGenerateService: ContractGenerateService) { }

    @Post('generate')
    async generateContract(@Body() dto: ContractGenerateDto) {
        return this.contractGenerateService.generateContract(dto);
    }

    // @Post('document')
    // async getDocument(@Body() dto: ContractGenerateDto) {
    //     return this.contractGenerateService.getDocument(dto);
    // }
}
