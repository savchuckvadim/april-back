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
import { BxRqService } from '../services/bx-rq.service';
import { CreateBxRqDto } from '../dto/create-bx-rq.dto';
import { UpdateBxRqDto } from '../dto/update-bx-rq.dto';
import { BxRqResponseDto } from '../dto/bx-rq-response.dto';
import { SuccessResponseDto, EResultCode } from '@/core';

@ApiTags('Admin Bx RQs Management')
@Controller('admin/portals/bx-rqs')
export class BxRqController {
    constructor(private readonly rqService: BxRqService) { }

    @ApiOperation({ summary: 'Create a new bx RQ' })
    @ApiResponse({
        status: 201,
        description: 'RQ created successfully',
        type: BxRqResponseDto,
    })
    @Post()
    async createRq(@Body() createRqDto: CreateBxRqDto): Promise<SuccessResponseDto> {
        const rq = await this.rqService.create(createRqDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: rq,
        };
    }

    @ApiOperation({ summary: 'Get RQ by ID' })
    @ApiResponse({
        status: 200,
        description: 'RQ found',
        type: BxRqResponseDto,
    })
    @Get(':id')
    async getRqById(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        const rq = await this.rqService.findById(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: rq,
        };
    }

    @ApiOperation({ summary: 'Get all RQs' })
    @ApiResponse({
        status: 200,
        description: 'RQs found',
        type: [BxRqResponseDto],
    })
    @Get()
    async getAllRqs(@Query('portal_id') portalId?: string): Promise<SuccessResponseDto> {
        let rqs;
        if (portalId) {
            rqs = await this.rqService.findByPortalId(Number(portalId));
        } else {
            rqs = await this.rqService.findMany();
        }

        return {
            resultCode: EResultCode.SUCCESS,
            data: rqs,
        };
    }

    @ApiOperation({ summary: 'Update RQ' })
    @ApiResponse({
        status: 200,
        description: 'RQ updated successfully',
        type: BxRqResponseDto,
    })
    @Put(':id')
    async updateRq(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateRqDto: UpdateBxRqDto,
    ): Promise<SuccessResponseDto> {
        const rq = await this.rqService.update(id, updateRqDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: rq,
        };
    }

    @ApiOperation({ summary: 'Delete RQ' })
    @ApiResponse({
        status: 200,
        description: 'RQ deleted successfully',
    })
    @Delete(':id')
    async deleteRq(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        await this.rqService.delete(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: null,
        };
    }
}

