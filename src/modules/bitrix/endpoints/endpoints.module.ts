import { Module } from '@nestjs/common';
import { BitrixDepartmentEndpointModule } from './department/department-endpoint.module';
// C:\Projects\April-KP\april-next\back\src\modules\bitrix\endpoints\endpoints.module.ts
@Module({
    imports: [
        BitrixDepartmentEndpointModule
    ],
    exports: [
        BitrixDepartmentEndpointModule
    ]
})
export class BitrixEndpointsModule { }
