import { Injectable } from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import { setInnManually } from '@lib/portal-lib/pbx-inn';
import {
    KonstructorInnSetDto,
    KonstructorInnSetResponseDto,
} from '../dto/inn-set.dto';

/**
 * ИНН клиента из конструктора: смена текущих реквизитов пишет ИНН в
 * `op_inn` и пополняет пул `op_inn_pool`.
 *
 * Логики здесь нет: запись, подпись автора и перевод ошибок в 400 / 409
 * живут в `setInnManually` (`@lib/portal-lib/pbx-inn`), тем же кодом, что
 * ручка `POST inn/set` приложения event-sales. Инстанс Битрикса на домен и
 * запрос создаёт `PBXService`, в поле его никто не хранит.
 */
@Injectable()
export class KonstructorInnSetUseCase {
    constructor(private readonly pbx: PBXService) {}

    async execute(
        dto: KonstructorInnSetDto,
    ): Promise<KonstructorInnSetResponseDto> {
        return setInnManually(this.pbx, dto);
    }
}
