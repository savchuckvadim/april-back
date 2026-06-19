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
import { portal_contracts } from 'generated/prisma';
import { PortalContractService } from '@lib/portal-lib/konstructor';
import { CreatePortalContractDto } from '../dto/create-portal-contract.dto';
import { UpdatePortalContractDto } from '../dto/update-portal-contract.dto';
import { PortalContractResponseDto } from '../dto/portal-contract-response.dto';
import { GetPortalContractsQueryDto } from '../dto/get-portal-contracts-query.dto';

@ApiTags('Admin Portal Contracts Management')
@Controller('admin/pbx/portal-contracts')
export class PortalContractController {
    constructor(
        private readonly portalContractService: PortalContractService,
    ) {}

    @ApiOperation({ summary: 'Create a new portal contract' })
    @ApiResponse({
        status: 201,
        description: 'Portal contract created successfully',
        type: PortalContractResponseDto,
    })
    @Post()
    async createPortalContract(
        @Body() createPortalContractDto: CreatePortalContractDto,
    ): Promise<PortalContractResponseDto> {
        const portalContract = await this.portalContractService.create({
            portal_id: BigInt(createPortalContractDto.portal_id),
            contract_id: BigInt(createPortalContractDto.contract_id),
            portal_measure_id: BigInt(
                createPortalContractDto.portal_measure_id,
            ),
            bitrixfield_item_id: BigInt(
                createPortalContractDto.bitrixfield_item_id,
            ),
            title: createPortalContractDto.title,
            template: createPortalContractDto.template,
            order: createPortalContractDto.order,
            productName: createPortalContractDto.productName,
            description: createPortalContractDto.description,
        });
        return new PortalContractResponseDto(portalContract);
    }

    @ApiOperation({ summary: 'Get portal contract by ID' })
    @ApiResponse({
        status: 200,
        description: 'Portal contract found',
        type: PortalContractResponseDto,
    })
    @Get(':id')
    async getPortalContractById(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<PortalContractResponseDto> {
        const portalContract = await this.portalContractService.findById(id);
        return new PortalContractResponseDto(portalContract);
    }

    @ApiOperation({ summary: 'Get all portal contracts' })
    @ApiResponse({
        status: 200,
        description: 'Portal contracts found',
        type: [PortalContractResponseDto],
    })
    @Get()
    async getListPortalContracts(
        @Query() query: GetPortalContractsQueryDto,
    ): Promise<PortalContractResponseDto[]> {
        let portalContracts: portal_contracts[];
        const { portalId, contractId } = query;
        if (portalId) {
            portalContracts = await this.portalContractService.findByPortalId(
                Number(portalId),
            );
        } else if (contractId) {
            portalContracts = await this.portalContractService.findByContractId(
                Number(contractId),
            );
        } else {
            portalContracts = await this.portalContractService.findMany();
        }

        return portalContracts.map(c => new PortalContractResponseDto(c));
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
    ): Promise<PortalContractResponseDto> {
        const portalContract = await this.portalContractService.update(id, {
            portal_id:
                updatePortalContractDto.portal_id !== undefined
                    ? BigInt(updatePortalContractDto.portal_id)
                    : undefined,
            contract_id:
                updatePortalContractDto.contract_id !== undefined
                    ? BigInt(updatePortalContractDto.contract_id)
                    : undefined,
            portal_measure_id:
                updatePortalContractDto.portal_measure_id !== undefined
                    ? BigInt(updatePortalContractDto.portal_measure_id)
                    : undefined,
            bitrixfield_item_id:
                updatePortalContractDto.bitrixfield_item_id !== undefined
                    ? BigInt(updatePortalContractDto.bitrixfield_item_id)
                    : undefined,
            title: updatePortalContractDto.title,
            template: updatePortalContractDto.template,
            order: updatePortalContractDto.order,
            productName: updatePortalContractDto.productName,
            description: updatePortalContractDto.description,
        });
        return new PortalContractResponseDto(portalContract);
    }

    @ApiOperation({ summary: 'Delete portal contract' })
    @ApiResponse({
        status: 200,
        description: 'Portal contract deleted successfully',
    })
    @Delete(':id')
    async deletePortalContract(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<boolean> {
        await this.portalContractService.delete(id);
        return true;
    }
}
