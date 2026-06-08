import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Put,
} from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { PortalKeysService } from './portal-keys.service';
import { ParsePortalKeyNamePipe } from './parse-portal-key-name.pipe';
import { PORTAL_KEY_NAMES, PortalKeyName } from './portal-key.const';
import { SetPortalKeyDto } from './dto/set-portal-key.dto';
import { PortalKeyResponseDto } from './dto/portal-key-response.dto';
import { PortalKeysResponseDto } from './dto/portal-keys-response.dto';

/**
 * Админ-эндпоинты управления ключами интеграций портала.
 * Ключи хранятся в БД в зашифрованном виде, наружу отдаются расшифрованными.
 * Конкретный ключ выбирается path-параметром `keyName` (enum).
 */
@ApiTags('Admin Portal Keys')
@Controller('admin/portal/:portalId/keys')
export class PortalKeysController {
    constructor(private readonly service: PortalKeysService) {}

    @Get()
    @ApiOperation({
        summary: 'Все ключи портала',
        description:
            'Возвращает все ключи интеграций портала в расшифрованном виде.',
    })
    @ApiParam({ name: 'portalId', type: Number, example: 1 })
    @ApiOkResponse({
        type: PortalKeysResponseDto,
        description: 'Набор всех ключей портала (расшифрованных).',
    })
    async getAll(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<PortalKeysResponseDto> {
        const keys = await this.service.getAll(portalId);
        return new PortalKeysResponseDto(keys);
    }

    @Get(':keyName')
    @ApiOperation({
        summary: 'Один ключ портала',
        description:
            'Возвращает расшифрованное значение указанного ключа портала.',
    })
    @ApiParam({ name: 'portalId', type: Number, example: 1 })
    @ApiParam({ name: 'keyName', enum: PORTAL_KEY_NAMES, example: 'nestKey' })
    @ApiOkResponse({
        type: PortalKeyResponseDto,
        description: 'Расшифрованное значение ключа (или null).',
    })
    async getOne(
        @Param('portalId', ParseIntPipe) portalId: number,
        @Param('keyName', ParsePortalKeyNamePipe) keyName: PortalKeyName,
    ): Promise<PortalKeyResponseDto> {
        const value = await this.service.get(portalId, keyName);
        return new PortalKeyResponseDto(keyName, value);
    }

    @Put(':keyName')
    @ApiOperation({
        summary: 'Задать/обновить ключ портала',
        description:
            'Шифрует переданное значение и сохраняет его как указанный ключ портала.',
    })
    @ApiParam({ name: 'portalId', type: Number, example: 1 })
    @ApiParam({ name: 'keyName', enum: PORTAL_KEY_NAMES, example: 'nestKey' })
    @ApiBody({
        type: SetPortalKeyDto,
        description: 'Открытое значение ключа для шифрования и сохранения.',
    })
    @ApiOkResponse({
        type: PortalKeyResponseDto,
        description: 'Ключ сохранён; возвращается актуальное значение.',
    })
    async set(
        @Param('portalId', ParseIntPipe) portalId: number,
        @Param('keyName', ParsePortalKeyNamePipe) keyName: PortalKeyName,
        @Body() dto: SetPortalKeyDto,
    ): Promise<PortalKeyResponseDto> {
        await this.service.set(portalId, keyName, dto.value);
        return new PortalKeyResponseDto(keyName, dto.value);
    }

    @Delete(':keyName')
    @ApiOperation({
        summary: 'Очистить ключ портала',
        description:
            'Удаляет значение указанного ключа портала (записывает null).',
    })
    @ApiParam({ name: 'portalId', type: Number, example: 1 })
    @ApiParam({ name: 'keyName', enum: PORTAL_KEY_NAMES, example: 'nestKey' })
    @ApiOkResponse({
        type: PortalKeyResponseDto,
        description: 'Ключ очищён; value = null.',
    })
    async remove(
        @Param('portalId', ParseIntPipe) portalId: number,
        @Param('keyName', ParsePortalKeyNamePipe) keyName: PortalKeyName,
    ): Promise<PortalKeyResponseDto> {
        await this.service.delete(portalId, keyName);
        return new PortalKeyResponseDto(keyName, null);
    }
}
