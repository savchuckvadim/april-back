import { Body, Controller, HttpCode, HttpException, HttpStatus, Logger, Post } from '@nestjs/common';
import { DepartmentResolverService } from './services/department-resolver-bitrxi.service';
import { DomainDto } from './dto/domain.dto';
import { EDepartamentGroup, IPortal } from 'src/modules/portal/interfaces/portal.interface';
import { BitrixApiService } from '../../core/http/bitrix-api.service';
import { PortalProviderService } from 'src/modules/portal/services/portal-provider.service';
// import { BitrixContextService } from '../../services/bitrix-context.service';

// C:\Projects\April-KP\april-next\back\src\modules\bitrix\endpoints\department\department.controller.ts
@Controller('bitrix/department')
export class DepartmentController {
  constructor(
    private readonly resolver: DepartmentResolverService,
    private readonly bitrixApi: BitrixApiService,
    private readonly portalProvider: PortalProviderService
  ) {

  }

  @Post('sales')
  @HttpCode(200)
  async getFullDepartment(@Body() dto: DomainDto) {
    // Logger.log('getFullDepartment dto');

    const portal = await this.portalProvider.getPortalByDomain(dto.domain)
    const Portal = await this.portalProvider.getModelByDomain(dto.domain)
    if (portal && Portal) {


      this.bitrixApi.initFromPortal(portal);

      return this.resolver.getFullDepartment(dto.domain, EDepartamentGroup.sales);
    }
    throw new HttpException('portal not found for domain:' + dto.domain, HttpStatus.BAD_REQUEST)
  }
}
