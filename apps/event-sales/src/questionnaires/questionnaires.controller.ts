import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import {
    EnumPortalAppCode,
    PORTAL_APP_CODES,
} from '@lib/portal-lib/store/app-settings';
import { PortalQuestionnairesService } from '@lib/portal-lib/store/questionnaires';
import {
    QuestionnaireCatalogDto,
    QuestionnaireCatalogVersionDto,
} from '@lib/portal-lib/store/questionnaires/portal-questionnaires.dto';

/**
 * Портальный каталог анкет для ФРЕЙМА: состав вопросов плана и отчёта,
 * заведённый порталом в админке из своих полей Битрикса. Отдаётся уже
 * скомпилированным — с готовым UF-именем поля и `bitrixId` элементов
 * справочника, поэтому слепок полей портала фронту не нужен.
 *
 * ТОЛЬКО ЧТЕНИЕ: пишется каталог исключительно админ-API
 * (`admin/portal/:portalId/questionnaires`). Ответ собирается из Redis-кэша
 * на 5 минут, так что дёргать эндпоинт на инициализации фрейма безопасно.
 *
 * Три договорённости, ради которых эндпоинт существует именно в таком виде:
 *  - портал без анкет — это ПУСТОЙ массив и 200, а не 404: фронт обязан
 *    спокойно жить без каталога (у него остаётся встроенный fallback), и
 *    «анкет не завели» не должно выглядеть как поломка бэка;
 *  - неисполнимые пункты сюда не доезжают — сломанную привязку к полю
 *    (`field_status !== 'ok'`), множественное поле и неизвестный контрол
 *    компиляция выбрасывает. Фрейму незачем знать про сломанные привязки, а
 *    главное — такой пункт не сможет заблокировать отправку отчёта
 *    обязательностью, которую физически нечем закрыть;
 *  - в ответе нет BigInt: репозиторий отдаёт `portal_id`/`field_bitrix_id`
 *    уже числами, иначе сериализация ответа падала бы.
 */
@ApiTags('Event Sales Questionnaires')
@Controller('questionnaires')
export class QuestionnairesController {
    constructor(private readonly service: PortalQuestionnairesService) {}

    @Get()
    @ApiOperation({
        summary: 'Каталог анкет приложения на домене',
        description:
            'Активные анкеты портала, скомпилированные под исполнение: ' +
            'условия показа, пункты с типом отображения и обязательностью, ' +
            'готовое имя поля и bitrixId вариантов справочника. Анкет нет — ' +
            'пустой `questionnaires` и 200 (не 404): фронт работает без ' +
            'каталога на встроенном наборе. Кэшируется на бэке — дёргать ' +
            'при инициализации фрейма безопасно.',
    })
    @ApiQuery({
        name: 'domain',
        description: 'Домен портала Bitrix.',
        type: String,
        example: 'example.bitrix24.ru',
    })
    @ApiQuery({
        name: 'app',
        description:
            'Код приложения; по умолчанию — event-sales (фрейм «Звонки»).',
        required: false,
        type: String,
        enum: PORTAL_APP_CODES,
        example: EnumPortalAppCode.eventSales,
    })
    @ApiOkResponse({
        type: QuestionnaireCatalogDto,
        description:
            'Каталог целиком: contract/version/hash + анкеты с пунктами.',
    })
    async resolve(
        @Query('domain') domain: string,
        @Query('app') app?: string,
    ): Promise<QuestionnaireCatalogDto> {
        return this.service.resolve(
            this.requireDomain(domain),
            this.appCode(app),
        );
    }

    @Get('version')
    @ApiOperation({
        summary: 'Версия каталога без самого состава',
        description:
            'Дешёвая проверка «менялся ли каталог»: фрейм держит свой hash ' +
            'и тянет полный каталог, только когда хэш разошёлся. ' +
            'Сравнивать нужно по `hash`: `version` — сумма версий анкет, ' +
            'при удалении анкеты она уменьшается.',
    })
    @ApiQuery({
        name: 'domain',
        description: 'Домен портала Bitrix.',
        type: String,
        example: 'example.bitrix24.ru',
    })
    @ApiQuery({
        name: 'app',
        description:
            'Код приложения; по умолчанию — event-sales (фрейм «Звонки»).',
        required: false,
        type: String,
        enum: PORTAL_APP_CODES,
        example: EnumPortalAppCode.eventSales,
    })
    @ApiOkResponse({
        type: QuestionnaireCatalogVersionDto,
        description:
            'Те же version и hash, что и в полном каталоге на этот момент.',
    })
    async version(
        @Query('domain') domain: string,
        @Query('app') app?: string,
    ): Promise<QuestionnaireCatalogVersionDto> {
        return this.service.getVersion(
            this.requireDomain(domain),
            this.appCode(app),
        );
    }

    /**
     * Домен обязателен: запрос без него — это не «портал без анкет», а
     * обращение без контекста. Отвечать на него пустым каталогом значило бы
     * замаскировать ошибку сборки ссылки под честный ответ.
     */
    private requireDomain(domain: string | undefined): string {
        const value = domain?.trim();
        if (!value) {
            throw new BadRequestException(
                'Не передан домен портала (?domain=example.bitrix24.ru)',
            );
        }
        return value;
    }

    /**
     * Код приложения проверкой по реестру НЕ ограничивается: сохранение
     * анкеты принимает любой код, и чтение не должно быть строже записи —
     * иначе сохранённый каталог оказался бы недостижим. Реестр здесь только
     * для Swagger (по нему генерится клиент) и дефолта.
     */
    private appCode(app: string | undefined): string {
        return app?.trim() || EnumPortalAppCode.eventSales;
    }
}
