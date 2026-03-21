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
import { GetBtxDealsQueryDto } from '../dto/get-btx-deal-query.dto';

@ApiTags('Admin Btx Deals Management')
@Controller('admin/pbx/deals')
export class BtxDealController {
    constructor(private readonly dealService: BtxDealService) {}

    @ApiOperation({ summary: 'Create a new btx deal' })
    @ApiResponse({
        status: 201,
        description: 'Deal created successfully',
        type: BtxDealResponseDto,
    })
    @Post()
    async createDeal(
        @Body() createDealDto: CreateBtxDealDto,
    ): Promise<BtxDealResponseDto> {
        const deal = await this.dealService.create(createDealDto);
        return deal;
    }

    @ApiOperation({ summary: 'Get all deals' })
    @ApiResponse({
        status: 200,
        description: 'Deals found',
        type: [BtxDealResponseDto],
    })
    @Get()
    async getAllDeals(
        @Query() query: GetBtxDealsQueryDto,
    ): Promise<BtxDealResponseDto[]> {
        let deals;
        if (query.portal_id) {
            deals = await this.dealService.findByPortalId(
                Number(query.portal_id),
            );
        } else {
            deals = await this.dealService.findMany();
        }
        deals = await this.dealService.findMany();
        return deals;
    }

    @ApiOperation({ summary: 'Get deal by ID' })
    @ApiResponse({
        status: 200,
        description: 'Deal found',
        type: BtxDealResponseDto,
    })
    @Get(':id')
    async getDealById(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<BtxDealResponseDto> {
        const deal = await this.dealService.findById(id);
        return deal;
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
    ): Promise<BtxDealResponseDto> {
        const deal = await this.dealService.update(id, updateDealDto);
        return deal;
    }

    @ApiOperation({ summary: 'Delete deal' })
    @ApiResponse({
        status: 200,
        description: 'Deal deleted successfully',
    })
    @Delete(':id')
    async deleteDeal(@Param('id', ParseIntPipe) id: number): Promise<boolean> {
        await this.dealService.delete(id);
        return true;
    }
}
