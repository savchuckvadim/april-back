import {
    Body,
    Controller,
    HttpCode,

    Post,
} from '@nestjs/common';

import {
    EDepartamentGroup,

} from 'src/modules/portal/interfaces/portal.interface';
import { ApiTags } from '@nestjs/swagger';
import { BxDepartmentService } from './services/bx-department.service';
import { BxDepartmentRequestDto } from './dto/bx-department.dto';


// C:\Projects\April-KP\april-next\back\src\modules\bitrix\endpoints\department\department.controller.ts

@ApiTags('Bitrix Domain Department')
@Controller('bitrix/department')
export class DepartmentEndpointController {
    constructor(
        private readonly service: BxDepartmentService,

    ) {}

    @Post('sales')
    @HttpCode(200)
    async getFullDepartment(@Body() dto: BxDepartmentRequestDto) {

            return this.service.getFullDepartment(
                dto.domain,
                EDepartamentGroup.sales,
            );

    }
}
