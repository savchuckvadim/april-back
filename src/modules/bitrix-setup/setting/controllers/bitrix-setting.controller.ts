import {
    Controller,
    Post,
    Put,
    Delete,
    Get,
    Body,
    Param,
    Query,
    HttpException,
    HttpStatus,
    ValidationPipe,
    UsePipes
} from '@nestjs/common';
import { BitrixSettingService } from '../services/bitrix-setting.service';
import { CreateBitrixSettingDto, UpdateBitrixSettingDto } from '../dto/bitrix-setting.dto';

@Controller('bitrix-setting')
export class BitrixSettingController {
    constructor(private readonly bitrixSettingService: BitrixSettingService) { }

    @Post('store')
    @UsePipes(new ValidationPipe({ transform: true }))
    async store(@Body() dto: CreateBitrixSettingDto, @Query('settingable_id') settingableId: string) {
        try {
            const setting = await this.bitrixSettingService.storeSetting(dto, BigInt(settingableId));

            return {
                success: true,
                result: {
                    message: 'Bitrix Setting saved',
                    setting: setting
                }
            };
        } catch (error) {
            throw new HttpException({
                success: false,
                error: 'Bitrix Setting failed',
                details: {
                    request: dto,
                    message: error.message,
                    stack: error.stack,
                }
            }, HttpStatus.BAD_REQUEST);
        }
    }

    @Get('get-by-settingable')
    async getBySettingable(
        @Query('settingable_id') settingableId: string,
        @Query('settingable_type') settingableType: string
    ) {
        try {
            const settings = await this.bitrixSettingService.getSettingsBySettingable(
                BigInt(settingableId),
                settingableType
            );

            return {
                success: true,
                result: settings
            };
        } catch (error) {
            throw new HttpException({
                success: false,
                error: 'Bitrix Settings not found',
                details: {
                    settingable_id: settingableId,
                    settingable_type: settingableType,
                    message: error.message,
                    stack: error.stack,
                }
            }, HttpStatus.NOT_FOUND);
        }
    }

    @Put('update/:id')
    @UsePipes(new ValidationPipe({ transform: true }))
    async update(@Param('id') id: string, @Body() dto: UpdateBitrixSettingDto) {
        try {
            const setting = await this.bitrixSettingService.updateSetting(BigInt(id), dto);

            return {
                success: true,
                result: {
                    message: 'Bitrix Setting updated',
                    setting: setting
                }
            };
        } catch (error) {
            throw new HttpException({
                success: false,
                error: 'Bitrix Setting update failed',
                details: {
                    id: id,
                    request: dto,
                    message: error.message,
                    stack: error.stack,
                }
            }, HttpStatus.BAD_REQUEST);
        }
    }

    @Delete('delete/:id')
    async delete(@Param('id') id: string) {
        try {
            const result = await this.bitrixSettingService.deleteSetting(BigInt(id));

            return {
                success: true,
                result: {
                    message: 'Bitrix Setting deleted',
                    deleted: result
                }
            };
        } catch (error) {
            throw new HttpException({
                success: false,
                error: 'Bitrix Setting delete failed',
                details: {
                    id: id,
                    message: error.message,
                    stack: error.stack,
                }
            }, HttpStatus.BAD_REQUEST);
        }
    }
}
