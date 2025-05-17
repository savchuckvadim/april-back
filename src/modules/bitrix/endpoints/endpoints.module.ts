import { Module } from '@nestjs/common';
import { BitrixDepartmentEndpointModule } from './department/department-endpoint.module';
import { BxListEndpointModule } from './list/bx-list-endpoint.module';


// C:\Projects\April-KP\april-next\back\src\modules\bitrix\endpoints\endpoints.module.ts
@Module({
    imports: [
        BitrixDepartmentEndpointModule,
        BxListEndpointModule,
      

    ],
    exports: [
        BitrixDepartmentEndpointModule,
        BxListEndpointModule

    ]
})
export class BitrixEndpointsModule { }
