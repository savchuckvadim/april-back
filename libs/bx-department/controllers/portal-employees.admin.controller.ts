import {
    Controller,
    Get,
    Param,
    ParseBoolPipe,
    ParseIntPipe,
    Query,
} from '@nestjs/common';
import {
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import { PortalEmployeeDto } from '../dto/portal-employee.dto';
import { PortalEmployeesService } from '../services/portal-employees.service';

/**
 * Сотрудники портала для выбора в настройках админки (поля «кому
 * отправлять», «кого исключить», суперпользователи). Только админка:
 * в прикладные приложения не подключается (ai/rules/app-api-surface.md).
 */
@ApiTags('Admin Portal Employees')
@Controller('admin/portal/:portalId/employees')
export class PortalEmployeesAdminController {
    constructor(private readonly employees: PortalEmployeesService) {}

    @Get()
    @ApiOperation({
        summary: 'Сотрудники портала',
        description:
            'Активные сотрудники портала из Битрикса (экстранет, почтовые и ' +
            'служебные пользователи отброшены) с должностью и отделами, по ' +
            'алфавиту. Кэш 10 минут; refresh=true — перечитать Битрикс сейчас.',
    })
    @ApiParam({
        name: 'portalId',
        description: 'Id портала в базе April.',
        type: Number,
        example: 12,
    })
    @ApiQuery({
        name: 'refresh',
        required: false,
        type: Boolean,
        description: 'Перечитать сотрудников из Битрикса мимо кэша.',
        example: false,
    })
    @ApiOkResponse({
        type: [PortalEmployeeDto],
        description: 'Сотрудники портала по алфавиту.',
    })
    @ApiNotFoundResponse({
        description: 'Портала нет или у него не задан домен.',
    })
    async list(
        @Param('portalId', ParseIntPipe) portalId: number,
        @Query('refresh', new ParseBoolPipe({ optional: true }))
        refresh?: boolean,
    ): Promise<PortalEmployeeDto[]> {
        return this.employees.listByPortalId(portalId, refresh === true);
    }
}
