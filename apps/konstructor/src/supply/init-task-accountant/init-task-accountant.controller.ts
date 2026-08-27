import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InitTaskAccountantDto } from './dto/init-task-accountant.dto';
import { InitTaskAccountantUseCase } from './init-task-accountant.use-case';

@ApiTags('Konstructor')
@Controller('supply')
export class InitTaskAccountantController {
    constructor(
        private readonly initTaskAccountantUseCase: InitTaskAccountantUseCase,
    ) {}

    @ApiOperation({
        summary: 'Задача бухгалтеру по заявке на поставку (вебхук робота RPA)',
    })
    @Post('init-task-accountant')
    async initTaskAccountant(
        @Body() body: InitTaskAccountantDto,
    ): Promise<{ taskId: number | null }> {
        const taskId = await this.initTaskAccountantUseCase.execute(body);
        return { taskId };
    }
}
