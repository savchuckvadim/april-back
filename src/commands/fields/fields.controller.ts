import { Controller, Get } from '@nestjs/common';
import { FieldsService } from './fields.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Bitrix Fields')
@Controller('bitrix-fields')
export class FieldsController {
  constructor(
    private readonly fieldsService: FieldsService,
  ) { }

  @ApiOperation({ summary: 'Получить пользовательские поля Bitrix' })
  @ApiResponse({
    status: 200,
    description: 'Возвращает список пользовательских полей',

  })
  @Get('')
  async getUserFields() {
    const domain = 'alfacentr.bitrix24.ru'
    await this.fieldsService.init(domain);
    return this.fieldsService.getDealFields();
  }

  @ApiOperation({ summary: 'Получить перечисления пользовательских полей Bitrix' })
  @ApiResponse({
    status: 200,
    description: 'Возвращает список перечислений пользовательских полей',

  })
  @Get('enumeration')
  async getUserFieldsEnumeration() {
    const domain = 'alfacentr.bitrix24.ru'
    await this.fieldsService.init(domain);
    return this.fieldsService.getUserFieldsEnumeration();
  }
}