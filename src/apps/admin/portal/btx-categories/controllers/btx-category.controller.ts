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
import { BtxCategoryService } from '../services/btx-category.service';
import { CreateBtxCategoryDto } from '../dto/create-btx-category.dto';
import { UpdateBtxCategoryDto } from '../dto/update-btx-category.dto';
import { BtxCategoryResponseDto } from '../dto/btx-category-response.dto';
import { SuccessResponseDto, EResultCode } from '@/core';

@ApiTags('Admin Btx Categories Management')
@Controller('admin/portals/btx-categories')
export class BtxCategoryController {
    constructor(private readonly categoryService: BtxCategoryService) { }

    @ApiOperation({ summary: 'Create a new btx category with optional stages' })
    @ApiResponse({
        status: 201,
        description: 'Category created successfully',
        type: BtxCategoryResponseDto,
    })
    @Post()
    async createCategory(@Body() createCategoryDto: CreateBtxCategoryDto): Promise<SuccessResponseDto> {
        const category = await this.categoryService.create(createCategoryDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: category,
        };
    }

    @ApiOperation({ summary: 'Get category by ID' })
    @ApiResponse({
        status: 200,
        description: 'Category found',
        type: BtxCategoryResponseDto,
    })
    @Get(':id')
    async getCategoryById(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        const category = await this.categoryService.findById(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: category,
        };
    }

    @ApiOperation({ summary: 'Get all categories' })
    @ApiResponse({
        status: 200,
        description: 'Categories found',
        type: [BtxCategoryResponseDto],
    })
    @Get()
    async getAllCategories(
        @Query('entity_type') entityType?: string,
        @Query('entity_id') entityId?: string,
        @Query('parent_type') parentType?: string,
    ): Promise<SuccessResponseDto> {
        let categories;
        if (entityType && entityId && parentType) {
            categories = await this.categoryService.findByEntityAndParentType(entityType, Number(entityId), parentType);
        } else if (entityType && entityId) {
            categories = await this.categoryService.findByEntity(entityType, Number(entityId));
        } else {
            categories = await this.categoryService.findMany();
        }

        return {
            resultCode: EResultCode.SUCCESS,
            data: categories,
        };
    }

    @ApiOperation({ summary: 'Update category' })
    @ApiResponse({
        status: 200,
        description: 'Category updated successfully',
        type: BtxCategoryResponseDto,
    })
    @Put(':id')
    async updateCategory(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateCategoryDto: UpdateBtxCategoryDto,
    ): Promise<SuccessResponseDto> {
        const category = await this.categoryService.update(id, updateCategoryDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: category,
        };
    }

    @ApiOperation({ summary: 'Delete category' })
    @ApiResponse({
        status: 200,
        description: 'Category deleted successfully',
    })
    @Delete(':id')
    async deleteCategory(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        await this.categoryService.delete(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: null,
        };
    }
}

