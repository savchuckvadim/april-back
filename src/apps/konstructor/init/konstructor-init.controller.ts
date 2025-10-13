import { Controller, Get } from '@nestjs/common';
import {
    KonstruktorInit,
    KonstructorInitUseCase,
} from './konstructor-init.use-case';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Konstructor')
@Controller('konstructor/init')
export class KonstructorInitController {
    constructor(private readonly useCase: KonstructorInitUseCase) {}

    @Get()
    @ApiOperation({ summary: 'Инициализационные данные для констркутора' })
    async init(): Promise<KonstruktorInit> {
        return await this.useCase.init();
    }
}
