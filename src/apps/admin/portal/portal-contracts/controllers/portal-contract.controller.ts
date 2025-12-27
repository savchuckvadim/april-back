import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    ParseIntPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PortalContractService } from '../services/portal-contract.service';
import { CreatePortalContractDto } from '../dto/create-portal-contract.dto';
import { UpdatePortalContractDto } from '../dto/update-portal-contract.dto';
import { PortalContractResponseDto } from '../dto/portal-contract-response.dto';
import { SuccessResponseDto, EResultCode } from '@/core';

@ApiTags('Admin Portal Contracts Management')
@Controller('admin/portals/portal-contracts')
export class PortalContractController {
    constructor(private readonly portalContractService: PortalContractService) { }

    @ApiOperation({ summary: 'Create a new portal contract' })
    @ApiResponse({
        status: 201,
        description: 'Portal contract created successfully',
        type: PortalContractResponseDto,
    })
    @Post()
    async createPortalContract(@Body() createPortalContractDto: CreatePortalContractDto): Promise<SuccessResponseDto> {
        const portalContract = await this.portalContractService.create(createPortalContractDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: portalContract,
        };
    }

    @ApiOperation({ summary: 'Get portal contract by ID' })
    @ApiResponse({
        status: 200,
        description: 'Portal contract found',
        type: PortalContractResponseDto,
    })
    @Get(':id')
    async getPortalContractById(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        const portalContract = await this.portalContractService.findById(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: portalContract,
        };
    }

    @ApiOperation({ summary: 'Get all portal contracts' })
    @ApiResponse({
        status: 200,
        description: 'Portal contracts found',
        type: [PortalContractResponseDto],
    })
    @Get()
    async getAllPortalContracts(
        @Query('portal_id') portalId?: string,
        @Query('contract_id') contractId?: string,
    ): Promise<SuccessResponseDto> {
        let portalContracts;
        if (portalId) {
            portalContracts = await this.portalContractService.findByPortalId(Number(portalId));
        } else if (contractId) {
            portalContracts = await this.portalContractService.findByContractId(Number(contractId));
        } else {
            portalContracts = await this.portalContractService.findMany();
        }

        return {
            resultCode: EResultCode.SUCCESS,
            data: portalContracts,
        };
    }

    @ApiOperation({ summary: 'Update portal contract' })
    @ApiResponse({
        status: 200,
        description: 'Portal contract updated successfully',
        type: PortalContractResponseDto,
    })
    @Put(':id')
    async updatePortalContract(
        @Param('id', ParseIntPipe) id: number,
        @Body() updatePortalContractDto: UpdatePortalContractDto,
    ): Promise<SuccessResponseDto> {
        const portalContract = await this.portalContractService.update(id, updatePortalContractDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: portalContract,
        };
    }

    @ApiOperation({ summary: 'Delete portal contract' })
    @ApiResponse({
        status: 200,
        description: 'Portal contract deleted successfully',
    })
    @Delete(':id')
    async deletePortalContract(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        await this.portalContractService.delete(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: null,
        };
    }
}

