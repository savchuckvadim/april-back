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
import { BitrixTokenService } from '../services/bitrix-token.service';
import { CreateBitrixTokenDto, GetBitrixTokenDto } from '../dto/bitrix-token.dto';

@Controller('bitrix-token')
export class BitrixTokenController {
    constructor(private readonly bitrixTokenService: BitrixTokenService) { }

    @Post('store-or-update')
    @UsePipes(new ValidationPipe({ transform: true }))
    async storeOrUpdate(@Body() dto: CreateBitrixTokenDto) {
        try {
            const result = await this.bitrixTokenService.storeOrUpdateToken(dto);

            return {
                success: true,
                result: {
                    message: result.message,
                    token_id: result.token.id,
                    token: result.token,
                    domain: dto.domain,
                }
            };
        } catch (error) {
            throw new HttpException({
                success: false,
                error: 'Bitrix Token failed',
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
    async get(@Query() dto: GetBitrixTokenDto) {
        try {
            const token = await this.bitrixTokenService.getToken(dto);

            return {
                success: true,
                result: token
            };
        } catch (error) {
            throw new HttpException({
                success: false,
                error: 'Bitrix Token not found',
                details: {
                    domain: dto.domain,
                    request: dto,
                    message: error.message,
                    stack: error.stack,
                }
            }, HttpStatus.NOT_FOUND);
        }
    }
}
