import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Post,
    Query,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CounterAdminService } from '../services/counter-admin.service';
import { CreateCounterDto } from '../document-counter.dto';
import {
    CounterResponseDto,
    CounterByRqItemDto,
    DeleteCounterResponseDto,
} from '../dto/counter-response.dto';

@ApiTags('Document Counter — Admin')
@Controller('document-counter/admin')
export class CounterAdminController {
    constructor(private readonly adminService: CounterAdminService) {}

    @ApiOperation({ summary: 'Get form initial data for creating a counter' })
    @ApiQuery({ name: 'rqId', required: false, type: Number })
    @ApiResponse({ status: 200, description: 'Form metadata returned' })
    @Get('initial')
    async getInitial(@Query('rqId') rqId?: string) {
        const initial = await this.adminService.getInitial(
            rqId ? Number(rqId) : undefined,
        );
        return { success: true, data: { initial } };
    }

    @ApiOperation({ summary: 'Get all counters' })
    @ApiResponse({
        status: 200,
        description: 'All counters',
        type: [CounterResponseDto],
    })
    @Get('all')
    async getAllCounters() {
        const counters = await this.adminService.getAllCounters();
        return { success: true, data: { counters } };
    }

    @ApiOperation({ summary: 'Get all counters for a given Rq' })
    @ApiResponse({
        status: 200,
        description: 'Counters for Rq',
        type: [CounterByRqItemDto],
    })
    @ApiResponse({ status: 404, description: 'Rq not found' })
    @Get('rq/:rqId')
    async findAllByRq(@Param('rqId', ParseIntPipe) rqId: number) {
        const counters = await this.adminService.findAllByRq(rqId);
        return { success: true, data: { counters } };
    }

    @ApiOperation({ summary: 'Get a single counter by id' })
    @ApiResponse({
        status: 200,
        description: 'Counter found',
        type: CounterResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Counter not found' })
    @Get(':counterId')
    async findOne(@Param('counterId', ParseIntPipe) counterId: number) {
        const counter = await this.adminService.findOne(counterId);
        return { success: true, data: { counter } };
    }

    @ApiOperation({ summary: 'Create a counter and attach to Rq' })
    @ApiResponse({
        status: 201,
        description: 'Counter created',
        type: CounterResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Rq not found' })
    @Post()
    @UsePipes(new ValidationPipe({ transform: true }))
    async create(@Body() dto: CreateCounterDto) {
        const counter = await this.adminService.create(dto);
        return { success: true, data: { counter } };
    }

    @ApiOperation({ summary: 'Delete a counter and its relations' })
    @ApiResponse({
        status: 200,
        description: 'Counter deleted',
        type: DeleteCounterResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Counter not found' })
    @Delete(':counterId')
    async remove(@Param('counterId', ParseIntPipe) counterId: number) {
        const result = await this.adminService.remove(counterId);
        return { success: true, data: result };
    }
}
