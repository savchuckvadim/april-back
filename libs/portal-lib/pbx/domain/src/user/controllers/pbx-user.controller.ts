import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import {
    ApiBody,
    ApiCreatedResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { PbxUserService } from '../services/pbx-user.service';
import { PbxUserEntityDto } from '../dto/pbx-user-entity.dto';
import { PbxUserCreateDto } from '../dto/pbx-user-create.dto';
import { PbxUserUpdateDto } from '../dto/pbx-user-update.dto';

@ApiTags('PBX User')
@Controller('pbx/user')
export class PbxUserController {
    constructor(private readonly pbxUserService: PbxUserService) {}

    @ApiOperation({
        summary: 'Список всех PBX-пользователей',
        description:
            'Возвращает всех пользователей PortalDB вместе с их полями (fields).',
    })
    @ApiOkResponse({
        description: 'Список пользователей найден.',
        type: [PbxUserEntityDto],
    })
    @Get('all')
    async getAllUsers(): Promise<PbxUserEntityDto[]> {
        return await this.pbxUserService.findAll();
    }

    @ApiOperation({
        summary: 'Получить пользователя по ID',
        description:
            'Находит пользователя PortalDB по его внутреннему идентификатору (id).',
    })
    @ApiParam({
        name: 'id',
        description: 'Внутренний идентификатор пользователя в PortalDB.',
        example: '1',
    })
    @ApiOkResponse({
        description: 'Пользователь найден.',
        type: PbxUserEntityDto,
    })
    @Get(':id')
    async getUserById(@Param('id') id: string): Promise<PbxUserEntityDto> {
        return await this.pbxUserService.findById(id);
    }

    @ApiOperation({
        summary: 'Получить пользователя по ID портала или по домену',
        description:
            'Если параметр состоит только из цифр — поиск выполняется по ' +
            'portalId, иначе — по домену портала (например, ' +
            'april-dev.bitrix24.ru). Один эндпоинт закрывает оба сценария ' +
            'и снимает конфликт маршрутов portal/:portalId и portal/:domain.',
    })
    @ApiParam({
        name: 'portalIdOrDomain',
        description:
            'ID портала (только цифры) либо домен портала ' +
            '(april-dev.bitrix24.ru).',
        example: 'april-dev.bitrix24.ru',
    })
    @ApiOkResponse({
        description: 'Пользователь найден.',
        type: PbxUserEntityDto,
    })
    @Get('portal/:portalIdOrDomain')
    async getUserByPortal(
        @Param('portalIdOrDomain') portalIdOrDomain: string,
    ): Promise<PbxUserEntityDto> {
        return /^\d+$/.test(portalIdOrDomain)
            ? await this.pbxUserService.findByPortalId(portalIdOrDomain)
            : await this.pbxUserService.findByPortalDomain(portalIdOrDomain);
    }

    @ApiOperation({
        summary: 'Создать пользователя по домену портала',
        description:
            'Создаёт пользователя в PortalDB, привязывая его к порталу, ' +
            'найденному по домену.',
    })
    @ApiParam({
        name: 'domain',
        description: 'Домен портала (april-dev.bitrix24.ru).',
        example: 'april-dev.bitrix24.ru',
    })
    @ApiBody({
        type: PbxUserUpdateDto,
        description: 'Данные пользователя (code) для создания.',
    })
    @ApiCreatedResponse({
        description: 'Пользователь создан.',
        type: PbxUserEntityDto,
    })
    @Post('domain/:domain')
    async createUserByDomain(
        @Param('domain') domain: string,
        @Body() user: PbxUserUpdateDto,
    ): Promise<PbxUserEntityDto> {
        return await this.pbxUserService.createByDomain(user.code, domain);
    }

    @ApiOperation({
        summary: 'Создать пользователя',
        description:
            'Создаёт пользователя в PortalDB по code и явному portalId.',
    })
    @ApiBody({
        type: PbxUserCreateDto,
        description: 'code пользователя и portalId портала.',
    })
    @ApiCreatedResponse({
        description: 'Пользователь создан.',
        type: PbxUserEntityDto,
    })
    @Post()
    async createUser(
        @Body() user: PbxUserCreateDto,
    ): Promise<PbxUserEntityDto> {
        return await this.pbxUserService.create(
            user.code,
            user.portalId.toString(),
        );
    }

    @ApiOperation({
        summary: 'Обновить пользователя',
        description: 'Обновляет данные пользователя PortalDB по его id.',
    })
    @ApiParam({
        name: 'id',
        description: 'Внутренний идентификатор пользователя в PortalDB.',
        example: '1',
    })
    @ApiBody({
        type: PbxUserUpdateDto,
        description: 'Новые данные пользователя (code).',
    })
    @ApiOkResponse({
        description: 'Пользователь обновлён.',
        type: PbxUserEntityDto,
    })
    @Put(':id')
    async updateUser(
        @Param('id') id: string,
        @Body() user: PbxUserUpdateDto,
    ): Promise<PbxUserEntityDto> {
        return await this.pbxUserService.update(id, user);
    }
}
