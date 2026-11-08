import { Controller, Get } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { Role, Roles } from '@lib/auth';
import { CabinetGuideDto } from '../dto/cabinet-guide.dto';
import { CabinetGuideService } from '../guide/cabinet-guide.service';

/** Путеводитель «Кабинет клиента» — только в apps/admin, только SUPER_USER. */
@ApiTags('Admin: кабинет клиента')
@ApiBearerAuth()
@Roles(Role.SUPER_USER)
@Controller('admin/cabinet/guide')
export class CabinetGuideAdminController {
    constructor(private readonly guide: CabinetGuideService) {}

    @Get()
    @ApiOperation({
        summary: 'Путеводитель по кабинету клиента',
        description:
            'Как устроен кабинет клиента, как подключить портал, доступы, пароли, Telegram, приложение и окружение — и живой чек-лист готовности: миграции, секрет входа, cookie, CORS, клиентский бот (имя по ответу Telegram), адрес вебхука, почта. Счётчики подключённых порталов и участников.',
    })
    @ApiOkResponse({
        type: CabinetGuideDto,
        description: 'Тексты, чек-лист и счётчики.',
    })
    get(): Promise<CabinetGuideDto> {
        return this.guide.build();
    }
}
