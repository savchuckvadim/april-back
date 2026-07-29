import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InnerDealService } from '../services/inner-deal.service';
import {
    InnerDealFindQueryDto,
    InnerDealFindResponseDto,
    InnerDealListQueryDto,
    InnerDealSnapshotDto,
    InnerDealUpsertDto,
} from '../dto/inner-deal.dto';
import { toInnerDealSnapshotDto } from '../lib/inner-deal.mapper';

@ApiTags('KonstructorDeal')
@Controller('konstructor/deal')
export class InnerDealController {
    constructor(private readonly service: InnerDealService) {}

    @Get()
    @ApiOperation({
        summary: 'Слепок сделки по domain+dealId (+serviceSmartId)',
    })
    @ApiResponse({
        status: 200,
        description: 'found:false — слепка нет (нормальный флоу новой сделки)',
        type: InnerDealFindResponseDto,
    })
    async find(
        @Query() query: InnerDealFindQueryDto,
    ): Promise<InnerDealFindResponseDto> {
        const deal = await this.service.findSnapshot(
            query.domain,
            query.dealId,
            query.serviceSmartId ?? null,
        );
        return {
            found: deal !== null,
            deal: deal ? toInnerDealSnapshotDto(deal) : null,
        };
    }

    @Get('list')
    @ApiOperation({
        summary: 'Все слепки сделки (обычный + сервисные смарты)',
    })
    @ApiResponse({
        status: 200,
        type: InnerDealSnapshotDto,
        isArray: true,
    })
    async list(
        @Query() query: InnerDealListQueryDto,
    ): Promise<InnerDealSnapshotDto[]> {
        const deals = await this.service.listByDealId(
            query.domain,
            query.dealId,
        );
        return deals.map(toInnerDealSnapshotDto);
    }

    @Post()
    @ApiOperation({
        summary: 'Upsert слепка по (domain, dealId, serviceSmartId)',
    })
    @ApiResponse({
        status: 201,
        type: InnerDealSnapshotDto,
    })
    async upsert(
        @Body() body: InnerDealUpsertDto,
    ): Promise<InnerDealSnapshotDto> {
        return toInnerDealSnapshotDto(await this.service.upsertSnapshot(body));
    }
}
