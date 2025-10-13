import {
    Controller,
    Get,
    Post,
    Put,
    Body,
    Param,
    ParseIntPipe,
} from '@nestjs/common';
import { ContractService } from './contract.service';
import { ContractEntity } from './contract.entity';
import { PortalContractEntity } from './portal-contract.entity';
import { ContractIdParamsDto, ContractPortalIdParamsDto } from './dtos/contract-params.dto';

@Controller('contracts')
export class ContractController {
    constructor(private readonly contractService: ContractService) { }

    @Post()
    async create(
        @Body() contract: Partial<ContractEntity>,
    ): Promise<ContractEntity | null> {
        return await this.contractService.create(contract);
    }

    @Put(':id')
    async update(
        @Param() params: ContractIdParamsDto,
        @Body() contract: Partial<ContractEntity>,
    ): Promise<ContractEntity | null> {
        return await this.contractService.update({
            ...contract,
            id: BigInt(params.id),
        });
    }

    @Get(':id')
    async findById(
        @Param() params: ContractIdParamsDto,
    ): Promise<ContractEntity | null> {
        return await this.contractService.findById(params.id);
    }

    @Get()
    async findMany(): Promise<ContractEntity[] | null> {
        return await this.contractService.findMany();
    }

    @Get('portal/:portalId')
    async findByPortalId(
        @Param() params: ContractPortalIdParamsDto,
    ): Promise<PortalContractEntity[] | null> {
        return await this.contractService.findByPortalId(params.portalId);
    }
}
