import { Body, Controller, HttpCode, HttpException, HttpStatus, Logger, Post } from '@nestjs/common';
import { DepartmentResolverService } from './services/department-resolver-bitrxi.service';
import { DomainDto } from './dto/domain.dto';
import { EDepartamentGroup, IPortal } from 'src/modules/portal/interfaces/portal.interface';
import { BitrixRequestApiService } from '../../core/http/bitrix-request-api.service';
import { PortalContextService } from 'src/modules/portal/services/portal-context.service';
// import { BitrixContextService } from '../../services/bitrix-context.service';

// C:\Projects\April-KP\april-next\back\src\modules\bitrix\endpoints\department\department.controller.ts
@Controller('bitrix/department')
export class DepartmentController {
  constructor(
    private readonly resolver: DepartmentResolverService,
    // private readonly bitrixApi: BitrixRequestApiService,
    private readonly portalService: PortalContextService
  ) {

  }

  @Post('sales')
  @HttpCode(200)
  async getFullDepartment(@Body() dto: DomainDto) {
    // Logger.log('getFullDepartment dto');

    const portal =  this.portalService.getPortal()
    const Portal =  this.portalService.getModel()
    if (portal && Portal) {


      // this.bitrixApi.initFromPortal(portal);

      return this.resolver.getFullDepartment(dto.domain, EDepartamentGroup.sales);
    }
    throw new HttpException('portal not found for domain:' + dto.domain, HttpStatus.BAD_REQUEST)
  }
}
