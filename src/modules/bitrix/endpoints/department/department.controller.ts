import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { DepartmentResolverService } from './services/department-resolver-bitrxi.service';
import { DomainDto } from './dto/domain.dto';
import { EDepartamentGroup } from 'src/modules/portal/interfaces/portal.interface';
import { BitrixContextService } from '../../services/bitrix-context.service';
@Controller('bitrix/department')
export class DepartmentController {
  constructor(
    private readonly resolver: DepartmentResolverService,
    private readonly bitrixContext: BitrixContextService
  ) {

  }

  @Post('sales')
  @HttpCode(200) 
  async getFullDepartment(@Body() dto: DomainDto) {
    // Logger.log('getFullDepartment dto');
    // Logger.log(dto);
    this.bitrixContext.initFromRequestContext();

    return this.resolver.getFullDepartment(dto.domain, EDepartamentGroup.sales);
  }
}
