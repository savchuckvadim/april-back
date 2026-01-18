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
import { AdminPortalResponseDto, AdminPortalWithRelationsResponseDto} from '../dto/portal-response.dto';
import { SuccessResponseDto, EResultCode } from '@/core';

@ApiTags('Admin Portal Management')
@Controller('admin/portals')
export class AdminPortalController {
    constructor(private readonly portalService: AdminPortalService) { }

    @ApiOperation({ summary: 'Create a new portal' })
    @ApiResponse({
        status: 201,
        description: 'Portal created successfully',
        type: AdminPortalResponseDto,
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
        type: AdminPortalWithRelationsResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Portal not found',
    })
    @Get(':id')
    async getPortalById(@Param('id', ParseIntPipe) id: number): Promise<AdminPortalWithRelationsResponseDto> {
        const portal = await this.portalService.findById(id);
        return portal;
    }

    @ApiOperation({ summary: 'Get all portals' })
    @ApiResponse({
        status: 200,
        description: 'Portals found',
        type: [AdminPortalResponseDto],
    })
    @Get()
    async getAllPortals(
        @Query('client_id') clientId?: string,
        @Query('domain') domain?: string,
    ): Promise<AdminPortalResponseDto[]> {
        let portals;
        if (clientId) {
            portals = await this.portalService.findByClientId(Number(clientId));
        } else if (domain) {
            const portal = await this.portalService.findByDomain(domain);
            portals = portal ? [portal] : [];
        } else {
            portals = await this.portalService.findMany();
        }

        return portals;
    }

    @ApiOperation({ summary: 'Get portal by domain' })
    @ApiResponse({
        status: 200,
        description: 'Portal found',
        type: AdminPortalResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Portal not found',
    })
    @Get('domain/:domain')
    async getPortalByDomain(@Param('domain') domain: string): Promise<AdminPortalResponseDto | null> {
        const portal = await this.portalService.findByDomain(domain);
       
        return portal;
    }

    @ApiOperation({ summary: 'Update portal' })
    @ApiResponse({
        status: 200,
        description: 'Portal updated successfully',
        type: AdminPortalResponseDto,
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
    ): Promise<AdminPortalResponseDto> {
        const portal = await this.portalService.update(id, updatePortalDto);
        return portal
    }

    @ApiOperation({ summary: 'Delete portal' })
    @ApiResponse({
        status: 200,
        description: 'Portal deleted successfully',
        type: Boolean,
    })
    @ApiResponse({
        status: 404,
        description: 'Portal not found',
    })
    @Delete(':id')
    async deletePortal(@Param('id', ParseIntPipe) id: number): Promise<boolean> {
        await this.portalService.delete(id);
        return true;
    }
}

