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
import { BtxRpaService } from '../services/btx-rpa.service';
import { CreateBtxRpaDto } from '../dto/create-btx-rpa.dto';
import { UpdateBtxRpaDto } from '../dto/update-btx-rpa.dto';
import { BtxRpaResponseDto } from '../dto/btx-rpa-response.dto';
import { SuccessResponseDto, EResultCode } from '@/core';

@ApiTags('Admin Btx RPAs Management')
@Controller('admin/portals/btx-rpas')
export class BtxRpaController {
    constructor(private readonly rpaService: BtxRpaService) { }

    @ApiOperation({ summary: 'Create a new btx RPA' })
    @ApiResponse({
        status: 201,
        description: 'RPA created successfully',
        type: BtxRpaResponseDto,
    })
    @Post()
    async createRpa(@Body() createRpaDto: CreateBtxRpaDto): Promise<SuccessResponseDto> {
        const rpa = await this.rpaService.create(createRpaDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: rpa,
        };
    }

    @ApiOperation({ summary: 'Get RPA by ID' })
    @ApiResponse({
        status: 200,
        description: 'RPA found',
        type: BtxRpaResponseDto,
    })
    @Get(':id')
    async getRpaById(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        const rpa = await this.rpaService.findById(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: rpa,
        };
    }

    @ApiOperation({ summary: 'Get all RPAs' })
    @ApiResponse({
        status: 200,
        description: 'RPAs found',
        type: [BtxRpaResponseDto],
    })
    @Get()
    async getAllRpas(@Query('portal_id') portalId?: string): Promise<SuccessResponseDto> {
        let rpas;
        if (portalId) {
            rpas = await this.rpaService.findByPortalId(Number(portalId));
        } else {
            rpas = await this.rpaService.findMany();
        }

        return {
            resultCode: EResultCode.SUCCESS,
            data: rpas,
        };
    }

    @ApiOperation({ summary: 'Update RPA' })
    @ApiResponse({
        status: 200,
        description: 'RPA updated successfully',
        type: BtxRpaResponseDto,
    })
    @Put(':id')
    async updateRpa(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateRpaDto: UpdateBtxRpaDto,
    ): Promise<SuccessResponseDto> {
        const rpa = await this.rpaService.update(id, updateRpaDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: rpa,
        };
    }

    @ApiOperation({ summary: 'Delete RPA' })
    @ApiResponse({
        status: 200,
        description: 'RPA deleted successfully',
    })
    @Delete(':id')
    async deleteRpa(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        await this.rpaService.delete(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: null,
        };
    }
}

