import { Controller, Get, Post, Put, Body, Param, ParseIntPipe } from "@nestjs/common";
import { ContractService } from "./contract.service";
import { ContractEntity } from "./contract.entity";
import { PortalContractEntity } from "./portal-contract.entity";

@Controller('contracts')
export class ContractController {
    constructor(
        private readonly contractService: ContractService,
    ) { }

    @Post()
    async create(@Body() contract: Partial<ContractEntity>): Promise<ContractEntity | null> {
        return await this.contractService.create(contract);
    }

    @Put(':id')
    async update(
        @Param('id', ParseIntPipe) id: number,
        @Body() contract: Partial<ContractEntity>
    ): Promise<ContractEntity | null> {
        return await this.contractService.update({ ...contract, id: BigInt(id) });
    }

    @Get(':id')
    async findById(@Param('id', ParseIntPipe) id: number): Promise<ContractEntity | null> {
        return await this.contractService.findById(id);
    }

    @Get()
    async findMany(): Promise<ContractEntity[] | null> {
        return await this.contractService.findMany();
    }

    @Get('portal/:portalId')
    async findByPortalId(
        @Param('portalId', ParseIntPipe) portalId: number
    ): Promise<PortalContractEntity[] | null> {
        return await this.contractService.findByPortalId(portalId);
    }
} 