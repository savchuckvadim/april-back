import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    ParseIntPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BitrixFieldService } from '../services/bitrixfield.service';
import { CreateBitrixFieldDto } from '../dto/create-bitrixfield.dto';
import { UpdateBitrixFieldDto } from '../dto/update-bitrixfield.dto';
import { BitrixFieldResponseDto } from '../dto/bitrixfield-response.dto';
import { CreateBitrixFieldsBulkDto } from '../dto/create-bitrixfields-bulk.dto';
import { GetChildrenByPbxEntityDto } from '../../pbx-shared';

@ApiTags('Admin Bitrix Fields Management')
@Controller('admin/pbx/bitrixfields')
export class BitrixFieldController {
    constructor(private readonly fieldService: BitrixFieldService) {}

    @ApiOperation({ summary: 'Create a new bitrix field with optional items' })
    @ApiResponse({
        status: 201,
        description: 'Field created successfully',
        type: BitrixFieldResponseDto,
    })
    @Post()
    async createField(
        @Body() createFieldDto: CreateBitrixFieldDto,
    ): Promise<BitrixFieldResponseDto> {
        const field = await this.fieldService.create(createFieldDto);
        return field;
    }

    @ApiOperation({ summary: 'Create multiple fields with items in bulk' })
    @ApiResponse({
        status: 201,
        description: 'Fields created successfully',
        type: [BitrixFieldResponseDto],
    })
    @Post('bulk')
    async createFieldsBulk(
        @Body() createFieldsBulkDto: CreateBitrixFieldsBulkDto,
    ): Promise<BitrixFieldResponseDto[]> {
        const fields = await this.fieldService.createBulk(createFieldsBulkDto);
        return fields;
    }

    @ApiOperation({ summary: 'Get field by ID' })
    @ApiResponse({
        status: 200,
        description: 'Field found',
        type: BitrixFieldResponseDto,
    })
    @Get(':id')
    async getFieldById(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<BitrixFieldResponseDto> {
        const field = await this.fieldService.findById(id);
        return field;
    }

    @ApiOperation({ summary: 'Get all fields' })
    @ApiResponse({
        status: 200,
        description: 'Fields found',
        type: [BitrixFieldResponseDto],
    })
    @Post('get-by-entity')
    async getFieldsByEntity(
        @Body() requestDto: GetChildrenByPbxEntityDto,
    ): Promise<BitrixFieldResponseDto[]> {
        return await this.fieldService.findByEntity(
            requestDto.entityType,
            requestDto.entityId,
        );
    }

    @ApiOperation({ summary: 'Get all fields' })
    @ApiResponse({
        status: 200,
        description: 'Fields found',
        type: [BitrixFieldResponseDto],
    })
    @Get('')
    async getAll(): Promise<BitrixFieldResponseDto[]> {
        return await this.fieldService.findMany();
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
    ): Promise<BitrixFieldResponseDto> {
        const field = await this.fieldService.update(id, updateFieldDto);
        return field;
    }

    @ApiOperation({ summary: 'Delete field' })
    @ApiResponse({
        status: 200,
        description: 'Field deleted successfully',
    })
    @Delete(':id')
    async deleteField(@Param('id', ParseIntPipe) id: number): Promise<boolean> {
        await this.fieldService.delete(id);
        return true;
    }
}
