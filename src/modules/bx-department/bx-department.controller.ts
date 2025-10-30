import {
    Body,
    Controller,
    HttpCode,
    HttpException,
    HttpStatus,
    Logger,
    Post,
} from '@nestjs/common';
import { BxDepartmentService } from './services/bx-department.service';
import { BxDepartmentRequestDto, BxDepartmentResponseDto } from './dto/bx-department.dto';
import { BxAllDepartmentsService } from './services/bx-all-departments.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Bitrix Domain Department')
@Controller('bx/department')
export class DepartmentController {
    constructor(
        private readonly service: BxDepartmentService,
        private readonly allDepartmentsService: BxAllDepartmentsService,
    ) { }

    @ApiOperation({ summary: 'Get full department information' })
    @ApiResponse({
        status: 200,
        description: 'Full department information',
        type: BxDepartmentResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Invalid input data' })
    @ApiResponse({ status: 500, description: 'Internal server error' })
    @Post('')
    @HttpCode(200)
    async getFullDepartment(@Body() dto: BxDepartmentRequestDto): Promise<BxDepartmentResponseDto> {
        return await this.service.getFullDepartment(dto.domain, dto.department);
    }

    // @ApiOperation({ summary: 'Get all departments' })

    // @Post('all')
    // @HttpCode(200)
    // async getAllDepartments(@Body() dto: DomaintDto) {

    //   return await this.allDepartmentsService.getAll(dto.domain);

    // }
}
