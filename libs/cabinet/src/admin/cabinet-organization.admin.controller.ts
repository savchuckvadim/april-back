import {
    Body,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Post,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { AuthUser, CurrentUser, Role, Roles } from '@lib/auth';
import { CabinetAccessService } from '../access/cabinet-access.service';
import { CabinetAdminPortalCardDto } from '../dto/cabinet-admin.dto';
import {
    CabinetCreateClientDto,
    CabinetOrganizationOverviewDto,
} from '../dto/cabinet-organization.dto';
import { CabinetOrganizationService } from './cabinet-organization.service';

/**
 * Организации-клиенты в админке April: завести организацию прямо с
 * портала и сводка клиента (порталы, владельцы, люди) для его страницы.
 */
@ApiTags('Admin: кабинет клиента')
@ApiBearerAuth()
@Roles(Role.SUPER_USER)
@Controller('admin/cabinet')
export class CabinetOrganizationAdminController {
    constructor(
        private readonly access: CabinetAccessService,
        private readonly organizations: CabinetOrganizationService,
    ) {}

    @Post('portals/:portalId/client')
    @ApiOperation({
        summary: 'Создать организацию для портала',
        description:
            'Для портала без клиента: заводит организацию-клиента и сразу привязывает к ней портал. Email уникален на всю базу — занятый email вернёт 409 с названием организации, которую нужно выбрать в списке.',
    })
    @ApiParam({ name: 'portalId', description: 'ID портала.', example: 12 })
    @ApiBody({ type: CabinetCreateClientDto, description: 'Организация.' })
    @ApiOkResponse({
        type: CabinetAdminPortalCardDto,
        description: 'Кабинет портала с новой организацией.',
    })
    async createClient(
        @CurrentUser() user: AuthUser,
        @Param('portalId', ParseIntPipe) portalId: number,
        @Body() dto: CabinetCreateClientDto,
    ): Promise<CabinetAdminPortalCardDto> {
        return this.organizations.createForPortal(
            await this.access.resolve(user, BigInt(portalId)),
            { name: dto.name, email: dto.email ?? null },
        );
    }

    @Get('clients/:clientId')
    @ApiOperation({
        summary: 'Сводка организации-клиента',
        description:
            'Порталы организации (владелец, участники, заявки, Telegram, приложение) и люди с доступом к кабинетам — для страницы клиента в админке.',
    })
    @ApiParam({
        name: 'clientId',
        description: 'ID организации-клиента.',
        example: 6,
    })
    @ApiOkResponse({
        type: CabinetOrganizationOverviewDto,
        description: 'Сводка организации.',
    })
    overview(
        @Param('clientId', ParseIntPipe) clientId: number,
    ): Promise<CabinetOrganizationOverviewDto> {
        return this.organizations.overview(clientId);
    }
}
