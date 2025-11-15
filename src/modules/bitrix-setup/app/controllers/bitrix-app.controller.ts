import {
    Controller,
    Post,
    Get,
    Put,
    Delete,
    Body,
    Query,
    Param,
    HttpException,
    HttpStatus,
    ValidationPipe,
    UsePipes
} from '@nestjs/common';
import { BitrixAppService } from '../services/bitrix-app.service';
import {
    CreateBitrixAppDto,
    CreateBitrixAppWithTokenDto,
    GetBitrixAppDto,
    UpdateBitrixAppDto,

} from '../dto/bitrix-app.dto';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiParam,
    ApiQuery,
    ApiBody,
    ApiBadRequestResponse,
    ApiNotFoundResponse,
    ApiInternalServerErrorResponse,
    ApiCreatedResponse
} from '@nestjs/swagger';
import { SuccessResponseDto, ErrorResponseDto } from 'src/core';

/**
 * Bitrix Setup App Controller
 *
 * Все ответы автоматически обрабатываются ResponseInterceptor из src/core/interceptors/response.interceptor.ts
 * который преобразует ответы в формат: { resultCode: 0, data: ... }
 *
 * Ошибки обрабатываются глобальными фильтрами из src/core/filters
 */
@ApiTags('Bitrix Setup App')
@Controller('bitrix-app')
export class BitrixAppController {
    constructor(private readonly bitrixAppService: BitrixAppService) { }

    @Post('store-or-update')
    @UsePipes(new ValidationPipe({ transform: true }))
    @ApiOperation({
        summary: 'Создать или обновить приложение Bitrix24',
        description: 'Создает новое приложение или обновляет существующее в системе Bitrix24'
    })
    @ApiBody({
        type: CreateBitrixAppWithTokenDto,
        description: 'Данные приложения для создания или обновления'
    })
    @ApiCreatedResponse({
        description: 'Приложение успешно создано или обновлено. Ответ обрабатывается ResponseInterceptor из src/core/interceptors',
        type: SuccessResponseDto,

    })
    @ApiBadRequestResponse({
        description: 'Некорректные данные запроса',
        type: ErrorResponseDto
    })
    async storeOrUpdate(@Body() dto: CreateBitrixAppWithTokenDto) {
        try {
            const result = await this.bitrixAppService.storeOrUpdateAppWithToken(dto);

            return {
                success: true,
                result: {
                    message: result.message,
                    app_id: result.app.id,
                    app: result.app,
                    domain: dto.domain,
                }
            };
        } catch (error) {
            throw new HttpException({
                success: false,
                error: 'Bitrix App failed',
                details: {
                    domain: dto.domain,
                    request: dto,
                    message: error.message,
                    stack: error.stack,
                }
            }, HttpStatus.BAD_REQUEST);
        }
    }

    @Get('get')
    @UsePipes(new ValidationPipe({ transform: true }))
    @ApiOperation({
        summary: 'Получить приложение Bitrix24',
        description: 'Получает информацию о приложении по домену и коду'
    })
    @ApiQuery({
        name: 'domain',
        description: 'Домен портала Bitrix24',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @ApiQuery({
        name: 'code',
        description: 'Код приложения',
        example: 'my_app',
        type: String,
    })
    @ApiResponse({
        status: 200,
        description: 'Приложение найдено. Ответ обрабатывается ResponseInterceptor из src/core/interceptors',
        type: SuccessResponseDto,

    })
    @ApiNotFoundResponse({
        description: 'Приложение не найдено',
        type: ErrorResponseDto
    })
    async get(@Query() dto: GetBitrixAppDto) {
        try {
            const app = await this.bitrixAppService.getApp(dto);

            return {
                success: true,
                result: app
            };
        } catch (error) {
            throw new HttpException({
                success: false,
                error: 'Bitrix App not found',
                details: {
                    domain: dto.domain,
                    request: dto,
                    message: error.message,
                    stack: error.stack,
                }
            }, HttpStatus.NOT_FOUND);
        }
    }

    @Get('all')
    @ApiOperation({
        summary: 'Получить все приложения Bitrix24',
        description: 'Получает список всех приложений в системе'
    })
    @ApiResponse({
        status: 200,
        description: 'Список приложений получен. Ответ обрабатывается ResponseInterceptor из src/core/interceptors',
        type: SuccessResponseDto,

    })
    @ApiInternalServerErrorResponse({
        description: 'Внутренняя ошибка сервера',
        type: ErrorResponseDto
    })
    async all() {
        try {
            const apps = await this.bitrixAppService.getAllApps();

            return {
                success: true,
                result: apps
            };
        } catch (error) {
            throw new HttpException({
                success: false,
                error: 'Bitrix Apps not found',
                details: {
                    message: error.message,
                    stack: error.stack,
                }
            }, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('get-by-portal')
    @UsePipes(new ValidationPipe({ transform: true }))
    @ApiOperation({
        summary: 'Получить приложения по порталу',
        description: 'Получает все приложения для указанного портала Bitrix24'
    })
    @ApiQuery({
        name: 'domain',
        description: 'Домен портала Bitrix24',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @ApiResponse({
        status: 200,
        description: 'Приложения портала найдены. Ответ обрабатывается ResponseInterceptor из src/core/interceptors',
        type: SuccessResponseDto,

    })
    @ApiNotFoundResponse({
        description: 'Приложения для портала не найдены',
        type: ErrorResponseDto
    })
    async getByPortal(@Query() dto: GetBitrixAppDto) {
        try {
            const apps = await this.bitrixAppService.getAppsByPortal(dto.domain);

            return {
                success: true,
                result: {
                    apps: apps
                }
            };
        } catch (error) {
            throw new HttpException({
                success: false,
                error: 'Bitrix Apps not found',
                details: {
                    domain: dto.domain,
                    request: dto,
                    message: error.message,
                    stack: error.stack,
                }
            }, HttpStatus.NOT_FOUND);
        }
    }

    @Put(':id')
    @UsePipes(new ValidationPipe({ transform: true }))
    @ApiOperation({
        summary: 'Обновить приложение Bitrix24',
        description: 'Обновляет существующее приложение по ID'
    })
    @ApiParam({
        name: 'id',
        description: 'ID приложения',
        example: 1,
        type: Number,
    })
    @ApiBody({
        type: UpdateBitrixAppDto,
        description: 'Данные для обновления приложения'
    })
    @ApiResponse({
        status: 200,
        description: 'Приложение успешно обновлено. Ответ обрабатывается ResponseInterceptor из src/core/interceptors',
        type: SuccessResponseDto,

    })
    @ApiNotFoundResponse({
        description: 'Приложение не найдено',
        type: ErrorResponseDto
    })
    @ApiBadRequestResponse({
        description: 'Некорректные данные запроса',
        type: ErrorResponseDto
    })
    async update(@Param('id') id: string, @Body() dto: UpdateBitrixAppDto) {
        try {
            const result = await this.bitrixAppService.updateApp(parseInt(id), dto);

            return {
                success: true,
                result: result
            };
        } catch (error) {
            throw new HttpException({
                success: false,
                error: 'Bitrix App not found',
                details: {
                    id: id,
                    message: error.message
                }
            }, HttpStatus.NOT_FOUND);
        }
    }

    @Delete(':id')
    @ApiOperation({
        summary: 'Удалить приложение Bitrix24',
        description: 'Удаляет приложение по ID'
    })
    @ApiParam({
        name: 'id',
        description: 'ID приложения',
        example: 1,
        type: Number,
    })
    @ApiResponse({
        status: 200,
        description: 'Приложение успешно удалено. Ответ обрабатывается ResponseInterceptor из src/core/interceptors',
        type: SuccessResponseDto
    })
    @ApiNotFoundResponse({
        description: 'Приложение не найдено',
        type: ErrorResponseDto
    })
    async delete(@Param('id') id: string) {
        try {
            const result = await this.bitrixAppService.deleteApp(BigInt(parseInt(id)));

            return {
                success: true,
                result: {
                    message: 'App deleted successfully',
                    id: parseInt(id)
                }
            };
        } catch (error) {
            throw new HttpException({
                success: false,
                error: 'Bitrix App not found',
                details: {
                    id: id,
                    message: error.message
                }
            }, HttpStatus.NOT_FOUND);
        }
    }
}
