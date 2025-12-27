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
import { AdminPortalService } from '../services/portal.service';
import { CreatePortalDto } from '../dto/create-portal.dto';
import { UpdatePortalDto } from '../dto/update-portal.dto';
import { PortalResponseDto } from '../dto/portal-response.dto';
import { SuccessResponseDto, EResultCode } from '@/core';

@ApiTags('Admin Portal Management')
@Controller('admin/portals')
export class AdminPortalController {
    constructor(private readonly portalService: AdminPortalService) { }

    @ApiOperation({ summary: 'Create a new portal' })
    @ApiResponse({
        status: 201,
        description: 'Portal created successfully',
        type: PortalResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Bad request - validation error',
    })
    @Post()
    async createPortal(@Body() createPortalDto: CreatePortalDto): Promise<SuccessResponseDto> {
        const portal = await this.portalService.create(createPortalDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: portal,
        };
    }

    @ApiOperation({ summary: 'Get portal by ID' })
    @ApiResponse({
        status: 200,
        description: 'Portal found',
        type: PortalResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Portal not found',
    })
    @Get(':id')
    async getPortalById(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        const portal = await this.portalService.findById(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: portal,
        };
    }

    @ApiOperation({ summary: 'Get all portals' })
    @ApiResponse({
        status: 200,
        description: 'Portals found',
        type: [PortalResponseDto],
    })
    @Get()
    async getAllPortals(
        @Query('client_id') clientId?: string,
        @Query('domain') domain?: string,
    ): Promise<SuccessResponseDto> {
        let portals;
        if (clientId) {
            portals = await this.portalService.findByClientId(Number(clientId));
        } else if (domain) {
            const portal = await this.portalService.findByDomain(domain);
            portals = portal ? [portal] : [];
        } else {
            portals = await this.portalService.findMany();
        }

        return {
            resultCode: EResultCode.SUCCESS,
            data: portals,
        };
    }

    @ApiOperation({ summary: 'Get portal by domain' })
    @ApiResponse({
        status: 200,
        description: 'Portal found',
        type: PortalResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Portal not found',
    })
    @Get('domain/:domain')
    async getPortalByDomain(@Param('domain') domain: string): Promise<SuccessResponseDto> {
        const portal = await this.portalService.findByDomain(domain);
        if (!portal) {
            return {
                resultCode: EResultCode.ERROR,
                data: null,
            };
        }
        return {
            resultCode: EResultCode.SUCCESS,
            data: portal,
        };
    }

    @ApiOperation({ summary: 'Update portal' })
    @ApiResponse({
        status: 200,
        description: 'Portal updated successfully',
        type: PortalResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Portal not found',
    })
    @ApiResponse({
        status: 400,
        description: 'Bad request - validation error',
    })
    @Put(':id')
    async updatePortal(
        @Param('id', ParseIntPipe) id: number,
        @Body() updatePortalDto: UpdatePortalDto,
    ): Promise<SuccessResponseDto> {
        const portal = await this.portalService.update(id, updatePortalDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: portal,
        };
    }

    @ApiOperation({ summary: 'Delete portal' })
    @ApiResponse({
        status: 200,
        description: 'Portal deleted successfully',
    })
    @ApiResponse({
        status: 404,
        description: 'Portal not found',
    })
    @Delete(':id')
    async deletePortal(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        await this.portalService.delete(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: null,
        };
    }
}

