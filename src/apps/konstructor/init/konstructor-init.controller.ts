import { Controller, Get, Post } from '@nestjs/common';
import {

    KonstructorInitUseCase,
} from './konstructor-init.use-case';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { KonstructorInitDataDto } from './dto/response-init-data.dto';
import { Body } from '@nestjs/common';
import { GetInitDataDto } from './dto/request-init-data.dto';

@ApiTags('Konstructor')
@Controller('konstructor/init')
export class KonstructorInitController {
    constructor(private readonly useCase: KonstructorInitUseCase) {}

    @Post('data')
    @ApiOperation({
        summary: 'Инициализационные данные для констркутора',
    })
    @ApiResponse({
        status: 200,
        description: 'Инициализационные данные для констркутора',
        type: KonstructorInitDataDto,
    })
    async init(@Body() body: GetInitDataDto): Promise<KonstructorInitDataDto> {
        return await this.useCase.init(body.domain);
    }
}
