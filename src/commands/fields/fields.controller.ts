import { Controller, Get } from '@nestjs/common';
import { FieldsService } from './fields.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FieldsFactoryService } from './factory/fields-factory.service';
@ApiTags('Bitrix Fields')
@Controller('bitrix-fields')
export class FieldsController {
  constructor(
    private readonly factory: FieldsFactoryService
  ) { }

  @ApiOperation({ summary: 'Получить пользовательские поля Bitrix' })
  @ApiResponse({
    status: 200,
    description: 'Возвращает список пользовательских полей',

  })
  @Get('')
  async getUserFields() {
    const domain = 'alfacentr.bitrix24.ru'
    const service = await this.factory.getService(domain);
    return service.getDealFields();
  }

  @ApiOperation({ summary: 'Получить перечисления пользовательских полей Bitrix' })
  @ApiResponse({
    status: 200,
    description: 'Возвращает список перечислений пользовательских полей',

  })
  @Get('enumeration')
  async getUserFieldsEnumeration() {
    const domain = 'alfacentr.bitrix24.ru'
    const service = await this.factory.getService(domain);
    return service.getUserFieldsEnumeration();
  }
}