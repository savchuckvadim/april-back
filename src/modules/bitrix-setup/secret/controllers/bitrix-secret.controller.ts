import {
    Controller,
    Post,
    Get,
    Body,
    Query,
    HttpException,
    HttpStatus,
    ValidationPipe,
    UsePipes
} from '@nestjs/common';
import { BitrixSecretService } from '../services/bitrix-secret.service';
import { CreateBitrixSecretDto, GetBitrixSecretDto } from '../dto/bitrix-secret.dto';

@Controller('bitrix-secret')
export class BitrixSecretController {
    constructor(private readonly bitrixSecretService: BitrixSecretService) { }

    @Post('store-or-update')
    @UsePipes(new ValidationPipe({ transform: true }))
    async storeOrUpdate(@Body() dto: CreateBitrixSecretDto) {
        try {
            const result = await this.bitrixSecretService.storeOrUpdateSecret(dto);

            return {
                success: true,
                result: {
                    message: result.message,
                    app_id: result.app.id,
                    app: result.app,
                    client_id: result.app.client_id,
                    client_secret: result.app.client_secret,
                }
            };
        } catch (error) {
            throw new HttpException({
                success: false,
                error: 'Bitrix App Secret failed',
                details: {
                    request: dto,
                    message: error.message,
                    stack: error.stack,
                }
            }, HttpStatus.BAD_REQUEST);
        }
    }

    @Get('get-by-code')
    @UsePipes(new ValidationPipe({ transform: true }))
    async getByCode(@Query() dto: GetBitrixSecretDto) {
        try {
            const result = await this.bitrixSecretService.getSecretByCode(dto);

            return {
                success: true,
                result: {
                    app: result.app,
                    client_id: result.client_id,
                    client_secret: result.client_secret,
                }
            };
        } catch (error) {
            throw new HttpException({
                success: false,
                error: 'Bitrix App Secret not found',
                details: {
                    request: dto,
                    message: error.message,
                    stack: error.stack,
                }
            }, HttpStatus.NOT_FOUND);
        }
    }
}
