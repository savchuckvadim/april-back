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
import { BtxDealService } from '../services/btx-deal.service';
import { CreateBtxDealDto } from '../dto/create-btx-deal.dto';
import { UpdateBtxDealDto } from '../dto/update-btx-deal.dto';
import { BtxDealResponseDto } from '../dto/btx-deal-response.dto';
import { SuccessResponseDto, EResultCode } from '@/core';

@ApiTags('Admin Btx Deals Management')
@Controller('admin/portals/btx-deals')
export class BtxDealController {
    constructor(private readonly dealService: BtxDealService) { }

    @ApiOperation({ summary: 'Create a new btx deal' })
    @ApiResponse({
        status: 201,
        description: 'Deal created successfully',
        type: BtxDealResponseDto,
    })
    @Post()
    async createDeal(@Body() createDealDto: CreateBtxDealDto): Promise<SuccessResponseDto> {
        const deal = await this.dealService.create(createDealDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: deal,
        };
    }

    @ApiOperation({ summary: 'Get deal by ID' })
    @ApiResponse({
        status: 200,
        description: 'Deal found',
        type: BtxDealResponseDto,
    })
    @Get(':id')
    async getDealById(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        const deal = await this.dealService.findById(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: deal,
        };
    }

    @ApiOperation({ summary: 'Get all deals' })
    @ApiResponse({
        status: 200,
        description: 'Deals found',
        type: [BtxDealResponseDto],
    })
    @Get()
    async getAllDeals(@Query('portal_id') portalId?: string): Promise<SuccessResponseDto> {
        let deals;
        if (portalId) {
            deals = await this.dealService.findByPortalId(Number(portalId));
        } else {
            deals = await this.dealService.findMany();
        }

        return {
            resultCode: EResultCode.SUCCESS,
            data: deals,
        };
    }

    @ApiOperation({ summary: 'Update deal' })
    @ApiResponse({
        status: 200,
        description: 'Deal updated successfully',
        type: BtxDealResponseDto,
    })
    @Put(':id')
    async updateDeal(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateDealDto: UpdateBtxDealDto,
    ): Promise<SuccessResponseDto> {
        const deal = await this.dealService.update(id, updateDealDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: deal,
        };
    }

    @ApiOperation({ summary: 'Delete deal' })
    @ApiResponse({
        status: 200,
        description: 'Deal deleted successfully',
    })
    @Delete(':id')
    async deleteDeal(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        await this.dealService.delete(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: null,
        };
    }
}

