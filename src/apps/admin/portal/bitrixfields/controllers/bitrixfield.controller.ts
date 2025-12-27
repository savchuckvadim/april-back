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
import { BitrixFieldService } from '../services/bitrixfield.service';
import { CreateBitrixFieldDto } from '../dto/create-bitrixfield.dto';
import { UpdateBitrixFieldDto } from '../dto/update-bitrixfield.dto';
import { BitrixFieldResponseDto } from '../dto/bitrixfield-response.dto';
import { CreateBitrixFieldsBulkDto } from '../dto/create-bitrixfields-bulk.dto';
import { SuccessResponseDto, EResultCode } from '@/core';

@ApiTags('Admin Bitrix Fields Management')
@Controller('admin/portals/bitrixfields')
export class BitrixFieldController {
    constructor(private readonly fieldService: BitrixFieldService) {}

    @ApiOperation({ summary: 'Create a new bitrix field with optional items' })
    @ApiResponse({
        status: 201,
        description: 'Field created successfully',
        type: BitrixFieldResponseDto,
    })
    @Post()
    async createField(@Body() createFieldDto: CreateBitrixFieldDto): Promise<SuccessResponseDto> {
        const field = await this.fieldService.create(createFieldDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: field,
        };
    }

    @ApiOperation({ summary: 'Create multiple fields with items in bulk' })
    @ApiResponse({
        status: 201,
        description: 'Fields created successfully',
        type: [BitrixFieldResponseDto],
    })
    @Post('bulk')
    async createFieldsBulk(@Body() createFieldsBulkDto: CreateBitrixFieldsBulkDto): Promise<SuccessResponseDto> {
        const fields = await this.fieldService.createBulk(createFieldsBulkDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: fields,
        };
    }

    @ApiOperation({ summary: 'Get field by ID' })
    @ApiResponse({
        status: 200,
        description: 'Field found',
        type: BitrixFieldResponseDto,
    })
    @Get(':id')
    async getFieldById(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        const field = await this.fieldService.findById(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: field,
        };
    }

    @ApiOperation({ summary: 'Get all fields' })
    @ApiResponse({
        status: 200,
        description: 'Fields found',
        type: [BitrixFieldResponseDto],
    })
    @Get()
    async getAllFields(
        @Query('entity_type') entityType?: string,
        @Query('entity_id') entityId?: string,
        @Query('parent_type') parentType?: string,
    ): Promise<SuccessResponseDto> {
        let fields;
        if (entityType && entityId && parentType) {
            fields = await this.fieldService.findByEntityAndParentType(entityType, Number(entityId), parentType);
        } else if (entityType && entityId) {
            fields = await this.fieldService.findByEntity(entityType, Number(entityId));
        } else {
            fields = await this.fieldService.findMany();
        }

        return {
            resultCode: EResultCode.SUCCESS,
            data: fields,
        };
    }

    @ApiOperation({ summary: 'Update field' })
    @ApiResponse({
        status: 200,
        description: 'Field updated successfully',
        type: BitrixFieldResponseDto,
    })
    @Put(':id')
    async updateField(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateFieldDto: UpdateBitrixFieldDto,
    ): Promise<SuccessResponseDto> {
        const field = await this.fieldService.update(id, updateFieldDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: field,
        };
    }

    @ApiOperation({ summary: 'Delete field' })
    @ApiResponse({
        status: 200,
        description: 'Field deleted successfully',
    })
    @Delete(':id')
    async deleteField(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        await this.fieldService.delete(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: null,
        };
    }
}

