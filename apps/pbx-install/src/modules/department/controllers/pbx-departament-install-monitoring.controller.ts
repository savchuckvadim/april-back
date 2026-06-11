import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { IBXDepartment } from '@/modules/bitrix/domain/interfaces/bitrix.interface';
import { PbxDepartamentMonitoringService } from '../services/pbx-departament-monitoring.service';

@ApiTags('PBX Departament Install Monitoring')
@Controller('pbx-departament-install')
export class PbxDepartamentInstallMonitoringController {
    constructor(
        private readonly monitoringService: PbxDepartamentMonitoringService,
    ) {}

    @ApiOperation({
        summary: 'Get all portal departments from Bitrix',
        description:
            'Возвращает список всех отделов портала из Bitrix (`department.get`), read-only. ' +
            'По этому списку пользователь выбирает отдел и назначает его как ОП (sales) / ОС (service) ' +
            'через `POST /pbx-departament-install/install/domain/:domain/group/:group`.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @Get('/domain/:domain/bitrix-departments')
    async getAllBitrixDepartments(
        @Param('domain') domain: string,
    ): Promise<IBXDepartment[]> {
        return await this.monitoringService.getAllBitrixDepartments(domain);
    }

    @ApiOperation({
        summary: 'Get merged departaments state (PortalDB + read-only Bitrix)',
        description:
            'Возвращает смерженное по bitrixId состояние отделов: что есть в ' +
            'PortalDB (`departaments`) и read-only список отделов Bitrix ' +
            '(`department.get`), а также расхождения (есть только в БД / только в Bitrix). ' +
            'В Bitrix ничего не записывается.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @Get('/domain/:domain')
    async getDepartamentData(@Param('domain') domain: string) {
        return await this.monitoringService.getPbxDepartamentData(domain);
    }
}
