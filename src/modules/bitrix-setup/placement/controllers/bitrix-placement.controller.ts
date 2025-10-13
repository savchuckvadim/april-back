import {
    Controller,
    Post,
    Get,
    Delete,
    Body,
    Param,
    HttpException,
    HttpStatus,
    ValidationPipe,
    UsePipes
} from '@nestjs/common';
import { BitrixPlacementService } from '../services/bitrix-placement.service';
import { CreateBitrixPlacementDto } from '../dto/bitrix-placement.dto';

import { ApiTags } from '@nestjs/swagger';


@ApiTags('Bitrix Setup Placement')
@Controller('bitrix-placement')
export class BitrixPlacementController {
    constructor(private readonly bitrixPlacementService: BitrixPlacementService) { }

    @Post('store')
    @UsePipes(new ValidationPipe({ transform: true }))
    async store(@Body() dto: CreateBitrixPlacementDto) {
        try {
            const result = await this.bitrixPlacementService.storePlacements(dto);

            return {
                success: true,
                result: {
                    message: result.message,
                    app_id: result.app_id,
                    domain: dto.domain,
                }
            };
        } catch (error) {
            throw new HttpException({
                success: false,
                error: 'Bitrix App Placement failed',
                details: {
                    domain: dto.domain,
                    request: dto,
                    message: error.message,
                    stack: error.stack,
                }
            }, HttpStatus.BAD_REQUEST);
        }
    }

    @Get('get-by-app/:appId')
    async getByApp(@Param('appId') appId: string) {
        try {
            const placements = await this.bitrixPlacementService.getPlacementsByAppId(BigInt(appId));

            return {
                success: true,
                result: placements
            };
        } catch (error) {
            throw new HttpException({
                success: false,
                error: 'Bitrix App Placements not found',
                details: {
                    appId: appId,
                    message: error.message,
                    stack: error.stack,
                }
            }, HttpStatus.NOT_FOUND);
        }
    }

    @Delete('delete-by-app/:appId')
    async deleteByApp(@Param('appId') appId: string) {
        try {
            const result = await this.bitrixPlacementService.deletePlacementsByAppId(BigInt(appId));

            return {
                success: true,
                result: {
                    message: 'Bitrix App Placements deleted',
                    deleted: result
                }
            };
        } catch (error) {
            throw new HttpException({
                success: false,
                error: 'Bitrix App Placements delete failed',
                details: {
                    appId: appId,
                    message: error.message,
                    stack: error.stack,
                }
            }, HttpStatus.BAD_REQUEST);
        }
    }

    @Delete('delete/:id')
    async delete(@Param('id') id: string) {
        try {
            const result = await this.bitrixPlacementService.deletePlacement(BigInt(id));

            return {
                success: true,
                result: {
                    message: 'Bitrix App Placement deleted',
                    deleted: result
                }
            };
        } catch (error) {
            throw new HttpException({
                success: false,
                error: 'Bitrix App Placement delete failed',
                details: {
                    id: id,
                    message: error.message,
                    stack: error.stack,
                }
            }, HttpStatus.BAD_REQUEST);
        }
    }
}
