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
import { SmartService } from '../services/smart.service';
import { CreateSmartDto } from '../dto/create-smart.dto';
import { UpdateSmartDto } from '../dto/update-smart.dto';
import { SmartResponseDto } from '../dto/smart-response.dto';
import { SuccessResponseDto, EResultCode } from '@/core';

@ApiTags('Admin Smarts Management')
@Controller('admin/portals/smarts')
export class SmartController {
    constructor(private readonly smartService: SmartService) { }

    @ApiOperation({ summary: 'Create a new smart' })
    @ApiResponse({
        status: 201,
        description: 'Smart created successfully',
        type: SmartResponseDto,
    })
    @Post()
    async createSmart(@Body() createSmartDto: CreateSmartDto): Promise<SuccessResponseDto> {
        const smart = await this.smartService.create(createSmartDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: smart,
        };
    }

    @ApiOperation({ summary: 'Get smart by ID' })
    @ApiResponse({
        status: 200,
        description: 'Smart found',
        type: SmartResponseDto,
    })
    @Get(':id')
    async getSmartById(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        const smart = await this.smartService.findById(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: smart,
        };
    }

    @ApiOperation({ summary: 'Get all smarts' })
    @ApiResponse({
        status: 200,
        description: 'Smarts found',
        type: [SmartResponseDto],
    })
    @Get()
    async getAllSmarts(@Query('portal_id') portalId?: string): Promise<SuccessResponseDto> {
        let smarts;
        if (portalId) {
            smarts = await this.smartService.findByPortalId(Number(portalId));
        } else {
            smarts = await this.smartService.findMany();
        }

        return {
            resultCode: EResultCode.SUCCESS,
            data: smarts,
        };
    }

    @ApiOperation({ summary: 'Update smart' })
    @ApiResponse({
        status: 200,
        description: 'Smart updated successfully',
        type: SmartResponseDto,
    })
    @Put(':id')
    async updateSmart(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateSmartDto: UpdateSmartDto,
    ): Promise<SuccessResponseDto> {
        const smart = await this.smartService.update(id, updateSmartDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: smart,
        };
    }

    @ApiOperation({ summary: 'Delete smart' })
    @ApiResponse({
        status: 200,
        description: 'Smart deleted successfully',
    })
    @Delete(':id')
    async deleteSmart(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        await this.smartService.delete(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: null,
        };
    }
}

