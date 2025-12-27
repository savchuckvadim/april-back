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
import { TimezoneService } from '../services/timezone.service';
import { CreateTimezoneDto } from '../dto/create-timezone.dto';
import { UpdateTimezoneDto } from '../dto/update-timezone.dto';
import { TimezoneResponseDto } from '../dto/timezone-response.dto';
import { SuccessResponseDto, EResultCode } from '@/core';

@ApiTags('Admin Timezones Management')
@Controller('admin/portals/timezones')
export class TimezoneController {
    constructor(private readonly timezoneService: TimezoneService) { }

    @ApiOperation({ summary: 'Create a new timezone' })
    @ApiResponse({
        status: 201,
        description: 'Timezone created successfully',
        type: TimezoneResponseDto,
    })
    @Post()
    async createTimezone(@Body() createTimezoneDto: CreateTimezoneDto): Promise<SuccessResponseDto> {
        const timezone = await this.timezoneService.create(createTimezoneDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: timezone,
        };
    }

    @ApiOperation({ summary: 'Get timezone by ID' })
    @ApiResponse({
        status: 200,
        description: 'Timezone found',
        type: TimezoneResponseDto,
    })
    @Get(':id')
    async getTimezoneById(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        const timezone = await this.timezoneService.findById(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: timezone,
        };
    }

    @ApiOperation({ summary: 'Get all timezones' })
    @ApiResponse({
        status: 200,
        description: 'Timezones found',
        type: [TimezoneResponseDto],
    })
    @Get()
    async getAllTimezones(@Query('portal_id') portalId?: string): Promise<SuccessResponseDto> {
        let timezones;
        if (portalId) {
            timezones = await this.timezoneService.findByPortalId(Number(portalId));
        } else {
            timezones = await this.timezoneService.findMany();
        }

        return {
            resultCode: EResultCode.SUCCESS,
            data: timezones,
        };
    }

    @ApiOperation({ summary: 'Update timezone' })
    @ApiResponse({
        status: 200,
        description: 'Timezone updated successfully',
        type: TimezoneResponseDto,
    })
    @Put(':id')
    async updateTimezone(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateTimezoneDto: UpdateTimezoneDto,
    ): Promise<SuccessResponseDto> {
        const timezone = await this.timezoneService.update(id, updateTimezoneDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: timezone,
        };
    }

    @ApiOperation({ summary: 'Delete timezone' })
    @ApiResponse({
        status: 200,
        description: 'Timezone deleted successfully',
    })
    @Delete(':id')
    async deleteTimezone(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        await this.timezoneService.delete(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: null,
        };
    }
}

