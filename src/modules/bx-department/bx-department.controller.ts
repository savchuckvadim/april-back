import { Body, Controller, HttpCode, HttpException, HttpStatus, Logger, Post } from '@nestjs/common';
import { BxDepartmentService } from './services/bx-department.service';
import { BxDepartmentDto, DomaintDto } from './dto/bx-department.dto';
import { BxAllDepartmentsService } from './services/bx-all-departments.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Bitrix24 Department')
@Controller('bx/department')
export class DepartmentController {
  constructor(
    private readonly service: BxDepartmentService,
    private readonly allDepartmentsService: BxAllDepartmentsService
  ) {

  }

  @ApiOperation({ summary: 'Get full department information' })
  @ApiResponse({
    status: 200,
    description: 'Returns full department information including general department, children departments, and all users',
    schema: {
      type: 'object',
      properties: {
        department: {
          type: 'object',
          properties: {
            department: { type: 'number', description: 'Base department ID' },
            generalDepartment: { type: 'array', items: { type: 'object' }, description: 'General department information' },
            childrenDepartments: { type: 'array', items: { type: 'object' }, description: 'Child departments information' },
            allUsers: { type: 'array', items: { type: 'object' }, description: 'All users in the department' }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @Post('')
  @HttpCode(200)
  async getFullDepartment(@Body() dto: BxDepartmentDto) {


    return await this.service.getFullDepartment(dto.domain, dto.department);

  }

  // @ApiOperation({ summary: 'Get all departments' })
 
  // @Post('all')
  // @HttpCode(200)
  // async getAllDepartments(@Body() dto: DomaintDto) {


  //   return await this.allDepartmentsService.getAll(dto.domain);

  // }
}
