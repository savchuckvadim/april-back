import {
    Body,
    Controller,
    HttpCode,

    Post,
} from '@nestjs/common';
import { DepartmentResolverService } from './services/department-resolver-bitrxi.service';
import { DomainDto } from './dto/domain.dto';
import {
    EDepartamentGroup,

} from 'src/modules/portal/interfaces/portal.interface';
import { ApiTags } from '@nestjs/swagger';


// C:\Projects\April-KP\april-next\back\src\modules\bitrix\endpoints\department\department.controller.ts

@ApiTags('Bitrix Domain Department')
@Controller('bitrix/department')
export class DepartmentEndpointController {
    constructor(
        private readonly resolver: DepartmentResolverService,
        // private readonly bitrixApi: BitrixRequestApiService,
        // private readonly portalService: PortalContextService,
        // private readonly pbx: PBXService,
    ) {}

    @Post('sales')
    @HttpCode(200)
    async getFullDepartment(@Body() dto: DomainDto) {
        // Logger.log('getFullDepartment dto');

        // const { portal, PortalModel } = await this.pbx.init(dto.domain);
        // if (portal && PortalModel) {
            // this.bitrixApi.initFromPortal(portal);

            return this.resolver.getFullDepartment(
                dto.domain,
                EDepartamentGroup.sales,
            );
        // }
        // throw new HttpException(
        //     'portal not found for domain:' + dto.domain,
        //     HttpStatus.BAD_REQUEST,
        // );
    }
}
