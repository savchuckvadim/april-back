import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    ParseIntPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { contracts } from 'generated/prisma';
import { ContractService } from '@lib/portal-lib/konstructor';
import { CreateContractDto } from '../dto/create-contract.dto';
import { UpdateContractDto } from '../dto/update-contract.dto';
import { ContractResponseDto } from '../dto/contract-response.dto';

@ApiTags('Admin Contracts Management')
@Controller('admin/contracts')
export class ContractController {
    constructor(private readonly contractService: ContractService) {}

    @ApiOperation({ summary: 'Create a new contract' })
    @ApiResponse({
        status: 201,
        description: 'Contract created successfully',
        type: ContractResponseDto,
    })
    @Post()
    async createContract(
        @Body() createContractDto: CreateContractDto,
    ): Promise<ContractResponseDto> {
        const contract = await this.contractService.create({
            name: createContractDto.name,
            number: createContractDto.number,
            title: createContractDto.title,
            code: createContractDto.code,
            type: createContractDto.type,
            withPrepayment: createContractDto.withPrepayment,
            template: createContractDto.template,
            order: createContractDto.order,
            coefficient: createContractDto.coefficient,
            prepayment: createContractDto.prepayment,
            discount: createContractDto.discount,
            productName: createContractDto.productName,
            product: createContractDto.product,
            service: createContractDto.service,
            description: createContractDto.description,
            comment: createContractDto.comment,
            comment1: createContractDto.comment1,
            comment2: createContractDto.comment2,
        });
        return this.mapToResponseDto(contract);
    }

    @ApiOperation({ summary: 'Get contract by ID' })
    @ApiResponse({
        status: 200,
        description: 'Contract found',
        type: ContractResponseDto,
    })
    @Get(':id')
    async getContractById(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<ContractResponseDto> {
        const contract = await this.contractService.findById(id);
        return this.mapToResponseDto(contract);
    }

    @ApiOperation({ summary: 'Get all contracts' })
    @ApiResponse({
        status: 200,
        description: 'Contracts found',
        type: [ContractResponseDto],
    })
    @Get()
    async getAllContracts(): Promise<ContractResponseDto[]> {
        const contracts = await this.contractService.findMany();
        return contracts.map(c => this.mapToResponseDto(c));
    }

    @ApiOperation({ summary: 'Update contract' })
    @ApiResponse({
        status: 200,
        description: 'Contract updated successfully',
        type: ContractResponseDto,
    })
    @Put(':id')
    async updateContract(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateContractDto: UpdateContractDto,
    ): Promise<ContractResponseDto> {
        const contract = await this.contractService.update(id, {
            name: updateContractDto.name,
            number: updateContractDto.number,
            title: updateContractDto.title,
            code: updateContractDto.code,
            type: updateContractDto.type,
            withPrepayment: updateContractDto.withPrepayment,
            template: updateContractDto.template,
            order: updateContractDto.order,
            coefficient: updateContractDto.coefficient,
            prepayment: updateContractDto.prepayment,
            discount: updateContractDto.discount,
            productName: updateContractDto.productName,
            product: updateContractDto.product,
            service: updateContractDto.service,
            description: updateContractDto.description,
            comment: updateContractDto.comment,
            comment1: updateContractDto.comment1,
            comment2: updateContractDto.comment2,
        });
        return this.mapToResponseDto(contract);
    }

    @ApiOperation({ summary: 'Delete contract' })
    @ApiResponse({
        status: 200,
        description: 'Contract deleted successfully',
    })
    @Delete(':id')
    async deleteContract(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<boolean> {
        await this.contractService.delete(id);
        return true;
    }

    private mapToResponseDto(contract: contracts): ContractResponseDto {
        return {
            id: Number(contract.id),
            name: contract.name,
            number: contract.number,
            title: contract.title,
            code: contract.code,
            type: contract.type,
            withPrepayment: contract.withPrepayment,
            template: contract.template,
            order: contract.order,
            coefficient: contract.coefficient,
            prepayment: contract.prepayment,
            discount: Number(contract.discount),
            productName: contract.productName,
            product: contract.product,
            service: contract.service,
            description: contract.description,
            comment: contract.comment,
            comment1: contract.comment1,
            comment2: contract.comment2,
            created_at: contract.created_at,
            updated_at: contract.updated_at,
        };
    }
}
