import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BxDepartmentService } from './services/bx-department.service';
import {
    BxDepartmentRequestDto,
    BxDepartmentResponseDto,
} from './dto/bx-department.dto';

// C:\Projects\April-KP\april-next\back\src\modules\bitrix\endpoints\department\department.controller.ts

@ApiTags('Bitrix Domain Department')
@Controller('bitrix/department')
export class DepartmentEndpointController {
    constructor(private readonly service: BxDepartmentService) {}

    @ApiOperation({
        summary: 'Полная структура отдела продаж портала',
        description:
            'Отдел (общий + дочерние подразделения) со всеми пользователями. ' +
            'Замена legacy PHP `POST full/department`. Кэшируется в Redis на день.',
    })
    @ApiBody({ type: BxDepartmentRequestDto })
    @ApiOkResponse({ type: BxDepartmentResponseDto })
    @Post('sales')
    @HttpCode(200)
    async getFullDepartment(
        @Body() dto: BxDepartmentRequestDto,
    ): Promise<BxDepartmentResponseDto> {
        return this.service.getFullDepartment(
            dto.domain,
            EDepartamentGroup.sales,
        );
    }
}
