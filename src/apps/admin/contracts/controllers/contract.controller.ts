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
import { ContractService } from '../services/contract.service';
import { CreateContractDto } from '../dto/create-contract.dto';
import { UpdateContractDto } from '../dto/update-contract.dto';
import { ContractResponseDto } from '../dto/contract-response.dto';
import { SuccessResponseDto, EResultCode } from '@/core';

@ApiTags('Admin Contracts Management')
@Controller('admin/contracts')
export class ContractController {
    constructor(private readonly contractService: ContractService) { }

    @ApiOperation({ summary: 'Create a new contract' })
    @ApiResponse({
        status: 201,
        description: 'Contract created successfully',
        type: ContractResponseDto,
    })
    @Post()
    async createContract(@Body() createContractDto: CreateContractDto): Promise<SuccessResponseDto> {
        const contract = await this.contractService.create(createContractDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: contract,
        };
    }

    @ApiOperation({ summary: 'Get contract by ID' })
    @ApiResponse({
        status: 200,
        description: 'Contract found',
        type: ContractResponseDto,
    })
    @Get(':id')
    async getContractById(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        const contract = await this.contractService.findById(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: contract,
        };
    }

    @ApiOperation({ summary: 'Get all contracts' })
    @ApiResponse({
        status: 200,
        description: 'Contracts found',
        type: [ContractResponseDto],
    })
    @Get()
    async getAllContracts(): Promise<SuccessResponseDto> {
        const contracts = await this.contractService.findMany();
        return {
            resultCode: EResultCode.SUCCESS,
            data: contracts,
        };
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
    ): Promise<SuccessResponseDto> {
        const contract = await this.contractService.update(id, updateContractDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: contract,
        };
    }

    @ApiOperation({ summary: 'Delete contract' })
    @ApiResponse({
        status: 200,
        description: 'Contract deleted successfully',
    })
    @Delete(':id')
    async deleteContract(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        await this.contractService.delete(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: null,
        };
    }
}

