import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BxActivityDto } from '../dto/bx-activity/bx-activity.dto';
import { EventSalesActivityUseCase } from '../use-cases/bx-activity.use-case';

@ApiTags('Event Sales')
@Controller('event-sales')
export class EventSalesBxActivityController {
    constructor(
        private readonly bxActivityUseCase: EventSalesActivityUseCase,
    ) {}

    @Post('bx-activity')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Get activities by lead ID',
        description:
            'Retrieves all activities associated with a specific lead ID from Bitrix24',
    })
    @ApiResponse({
        status: 200,
        description: 'Successfully retrieved activities',
        type: [BxActivityDto],
    })
    @ApiResponse({
        status: 400,
        description: 'Invalid request parameters',
    })
    @ApiResponse({
        status: 500,
        description: 'Internal server error',
    })
    async getFullDepartment(@Body() dto: BxActivityDto) {
        await this.bxActivityUseCase.init(dto.domain);
        return await this.bxActivityUseCase.getActivitiesByLeadId(dto);
    }


    //TODO: get activities by company id
}
