import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { GetRqUseCase } from './use-cases/get-rq.use-case';
import { StoreRqUseCase } from './use-cases/store-rq.use-case';
import { UpdateAddressUseCase } from './use-cases/update-address.use-case';
import {
    GetRqRequestDto,
    StoreRqAddressResponseDto,
    StoreRqBankResponseDto,
    StoreRqItemResponseDto,
    StoreRqRequestDto,
    UpdateAddressRequestDto,
} from './dto/request.dto';
import { RqResponseDto } from './dto/erq-item.dto';

@ApiTags('Реквизиты')
@Controller('rq')
export class RqController {
    constructor(
        private readonly getRqUseCase: GetRqUseCase,
        private readonly storeRqUseCase: StoreRqUseCase,
        private readonly updateAddressUseCase: UpdateAddressUseCase,
    ) {}

    @Post('get_rq')
    @ApiOperation({
        summary: 'Получает хук от фронта',
        description:
            'domain (str): domain портала, company_id (int): id компании, iswait (bool): TRUE - внеочереди, FALSE - в очередь',
    })
    async getRq(@Body() body: GetRqRequestDto): Promise<RqResponseDto> {
        const result = await this.getRqUseCase.execute(body);

        return new RqResponseDto(result);
    }

    @Post('store_rq')
    @ApiOperation({
        summary: 'Получает хук от фронта',
        description:
            'domain (str): domain портала, company_id (int): id компании, rq(RQItem): набор полей {bx_id: int, fields: dict, address: list[RQAddress], bank: [RQBank], iswait (bool): TRUE - внеочереди, FALSE - в очередь',
    })
    async storeRq(
        @Body() body: StoreRqRequestDto,
    ): Promise<
        | StoreRqItemResponseDto
        | StoreRqAddressResponseDto
        | StoreRqBankResponseDto
    > {
        const result = await this.storeRqUseCase.execute(body);

        return { data: result };
    }

    @Post('update_address')
    @ApiOperation({
        summary: 'Обновляет адрес реквизита',
    })
    async updateAddress(
        @Body() body: UpdateAddressRequestDto,
    ): Promise<boolean> {
        const result = await this.updateAddressUseCase.execute(body);

        return result;
    }
}
