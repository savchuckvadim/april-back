import {
    Body,
    Controller,
    Delete,
    Get,
    NotFoundException,
    Param,
    ParseIntPipe,
    Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
    VendorSuperUserDto,
    VendorSuperUserSaveDto,
} from '../dto/vendor-super-user.dto';
import { VendorSuperUserRepository } from '../repositories/vendor-super-user.repository';
import { BxSuperUserService } from '../services/bx-super-user.service';

/**
 * Суперпользователи ВЕНДОРА в карточке портала админки April.
 *
 * Раньше список задавался env `BX_SUPER_USER_IDS` (`domain:id`): менять его
 * можно было только правкой окружения с перезапуском, и в интерфейсе он не
 * был виден. Теперь источник правды — таблица `vendor_super_users`.
 *
 * Роуты живут в админке и НЕ подключаются в прикладные приложения
 * (см. ai/rules/app-api-surface.md): правит доступ вендора только April.
 *
 * После каждой записи сбрасывается кэш домена в {@link BxSuperUserService} —
 * иначе снятый доступ доживал бы TTL (5 минут).
 */
@ApiTags('Admin Vendor Super Users')
@Controller('admin/portal/:portalId/vendor-super-users')
export class VendorSuperUserController {
    constructor(
        private readonly repository: VendorSuperUserRepository,
        private readonly superUsers: BxSuperUserService,
    ) {}

    @Get()
    @ApiOperation({
        summary: 'Суперпользователи April на портале',
        description:
            'Все записи портала, включая снятые с доступа (isActive = false), ' +
            'по возрастанию Bitrix-id. Пустой список — суперпользователей нет.',
    })
    @ApiResponse({ status: 200, type: [VendorSuperUserDto] })
    async list(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<VendorSuperUserDto[]> {
        return this.repository.findByPortalId(portalId);
    }

    @Post()
    @ApiOperation({
        summary: 'Завести или обновить доступ',
        description:
            'Повторный bitrixId не создаёт дубль, а обновляет комментарий и ' +
            'признак активности (уникальность — пара портал + bitrixId). ' +
            'Домен в записи берётся из самого портала, поэтому не может ' +
            'разъехаться с ним. Кэш домена сбрасывается сразу.',
    })
    @ApiResponse({ status: 201, type: VendorSuperUserDto })
    async save(
        @Param('portalId', ParseIntPipe) portalId: number,
        @Body() dto: VendorSuperUserSaveDto,
    ): Promise<VendorSuperUserDto> {
        const record = await this.repository.upsert(portalId, {
            bitrixId: dto.bitrixId,
            comment: dto.comment ?? null,
            isActive: dto.isActive,
        });
        await this.superUsers.invalidate(record.domain);
        return record;
    }

    @Delete(':bitrixId')
    @ApiOperation({
        summary: 'Убрать доступ совсем',
        description:
            'Удаляет запись. Чтобы снять права, сохранив историю, вместо ' +
            'удаления передайте isActive = false. 404 — записи уже нет.',
    })
    @ApiResponse({ status: 200, type: VendorSuperUserDto, isArray: true })
    async remove(
        @Param('portalId', ParseIntPipe) portalId: number,
        @Param('bitrixId', ParseIntPipe) bitrixId: number,
    ): Promise<VendorSuperUserDto[]> {
        const domain = await this.repository.remove(portalId, bitrixId);
        if (domain === null) {
            throw new NotFoundException(
                `Суперпользователь ${bitrixId} на портале ${portalId} не найден`,
            );
        }
        // Домен пришёл от удалённой записи, поэтому кэш сбрасывается и когда
        // это была последняя запись портала.
        await this.superUsers.invalidate(domain);
        return this.repository.findByPortalId(portalId);
    }
}
