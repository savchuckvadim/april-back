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
import { BtxLeadService } from '../services/btx-lead.service';
import { CreateBtxLeadDto } from '../dto/create-btx-lead.dto';
import { UpdateBtxLeadDto } from '../dto/update-btx-lead.dto';
import { BtxLeadResponseDto } from '../dto/btx-lead-response.dto';
import { SuccessResponseDto, EResultCode } from '@/core';

@ApiTags('Admin Btx Leads Management')
@Controller('admin/portals/btx-leads')
export class BtxLeadController {
    constructor(private readonly leadService: BtxLeadService) { }

    @ApiOperation({ summary: 'Create a new btx lead' })
    @ApiResponse({
        status: 201,
        description: 'Lead created successfully',
        type: BtxLeadResponseDto,
    })
    @Post()
    async createLead(@Body() createLeadDto: CreateBtxLeadDto): Promise<SuccessResponseDto> {
        const lead = await this.leadService.create(createLeadDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: lead,
        };
    }

    @ApiOperation({ summary: 'Get lead by ID' })
    @ApiResponse({
        status: 200,
        description: 'Lead found',
        type: BtxLeadResponseDto,
    })
    @Get(':id')
    async getLeadById(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        const lead = await this.leadService.findById(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: lead,
        };
    }

    @ApiOperation({ summary: 'Get all leads' })
    @ApiResponse({
        status: 200,
        description: 'Leads found',
        type: [BtxLeadResponseDto],
    })
    @Get()
    async getAllLeads(@Query('portal_id') portalId?: string): Promise<SuccessResponseDto> {
        let leads;
        if (portalId) {
            leads = await this.leadService.findByPortalId(Number(portalId));
        } else {
            leads = await this.leadService.findMany();
        }

        return {
            resultCode: EResultCode.SUCCESS,
            data: leads,
        };
    }

    @ApiOperation({ summary: 'Update lead' })
    @ApiResponse({
        status: 200,
        description: 'Lead updated successfully',
        type: BtxLeadResponseDto,
    })
    @Put(':id')
    async updateLead(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateLeadDto: UpdateBtxLeadDto,
    ): Promise<SuccessResponseDto> {
        const lead = await this.leadService.update(id, updateLeadDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: lead,
        };
    }

    @ApiOperation({ summary: 'Delete lead' })
    @ApiResponse({
        status: 200,
        description: 'Lead deleted successfully',
    })
    @Delete(':id')
    async deleteLead(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        await this.leadService.delete(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: null,
        };
    }
}

