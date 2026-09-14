import { BadGatewayException, Injectable } from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import {
    BitrixMethodDto,
    BitrixMethodResponseDto,
} from '../dto/bitrix-method.dto';

/**
 * Прокси одного REST-вызова Bitrix24 от имени портала.
 *
 * Нужен только dev-режиму легаси-фронта конструктора: вне iframe Bitrix
 * у него нет `BX24.callMethod`, и те же (method, params) он шлёт сюда.
 * В проде фронт ходит в Bitrix сам — ручка не используется.
 */
@Injectable()
export class BitrixMethodUseCase {
    constructor(private readonly pbx: PBXService) {}

    async execute(dto: BitrixMethodDto): Promise<BitrixMethodResponseDto> {
        // bitrix берём per-request и не оседаем им в this: в инстансе
        // копятся batch-команды (см. PBXService)
        const { bitrix } = await this.pbx.init(dto.domain);
        const body: unknown = await bitrix.api.call(dto.method, dto.bxData);
        return { result: this.unwrapResult(body, dto.method) };
    }

    /**
     * Фронт ждёт ровно `answer.result` из `BX24.callMethod`, а `api.call`
     * отдаёт всё тело ответа REST (`{ result, time, next, total }`) —
     * снимаем обёртку здесь, чтобы dev и prod вели себя одинаково.
     */
    private unwrapResult(body: unknown, method: string): unknown {
        if (body && typeof body === 'object' && 'result' in body) {
            return body.result;
        }
        // Ошибки Bitrix (4xx) сюда не доходят — axios бросает раньше.
        // 200 без result — не REST-ответ; молча отдать undefined нельзя,
        // фронт примет это за «данных нет».
        throw new BadGatewayException(
            `Bitrix не вернул result для метода ${method}`,
        );
    }
}
