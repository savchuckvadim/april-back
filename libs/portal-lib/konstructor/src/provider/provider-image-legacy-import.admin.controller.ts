import {
    BadRequestException,
    Controller,
    HttpCode,
    ParseBoolPipe,
    Post,
    Query,
    UploadedFiles,
    UseInterceptors,
} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBody,
    ApiConsumes,
    ApiOkResponse,
    ApiOperation,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import {
    PROVIDER_IMAGE_LEGACY_IMPORT_MESSAGES,
    ProviderImageLegacyImportReportDto,
    ProviderImageLegacyImportService,
    ProviderImageLegacyImportUploadDto,
    ProviderImageLegacyImportUploadInterceptor,
} from '../provider-image/legacy-import';

/**
 * ВРЕМЕННАЯ админ-ручка переноса печатей, подписей и логотипов из легаси в
 * картинки поставщика. После переноса удаляется вместе с папкой
 * `provider-image/legacy-import/` и регистрацией в `ProviderAdminModule`.
 */
@ApiTags('Admin Portal Provider')
@Controller('admin/portal/provider')
export class ProviderImageLegacyImportAdminController {
    constructor(
        private readonly legacyImport: ProviderImageLegacyImportService,
    ) {}

    @Post('images/legacy-import')
    @HttpCode(200)
    @UseInterceptors(ProviderImageLegacyImportUploadInterceptor)
    @ApiConsumes('multipart/form-data')
    @ApiOperation({
        summary: 'Перенести картинки реквизитов из легаси',
        description:
            'Временная ручка. Принимает файлы из копии папки clients легаси ' +
            '(в имени файла относительный путь) и сопоставляет их с записями ' +
            '`files` реквизитов по точному пути (имя без корня `clients/` ищется по ' +
            'хвосту пути и принимается, если подходит ровно одна запись, иначе файл ' +
            'попадает в отчёт как `skipped`). Из записей реквизитов выбирается ' +
            '«текущая» картинка каждой роли по правилам легаси: логотип и печать ' +
            'с наименьшим id, подписи руководителя и главного бухгалтера с ' +
            'наибольшим id. Картинка записывается тем же сервисом, что и загрузка ' +
            'из админки (перекодирование и лимиты те же). Уже существующие картинки ' +
            'не перезаписываются, повторный запуск копий не плодит. В режиме ' +
            'проверки (`dryRun=true`) ничего не записывается. Ответ — отчёт по ' +
            'всем записям `files` затронутых реквизитов и по файлам без записи.',
    })
    @ApiBody({
        type: ProviderImageLegacyImportUploadDto,
        description: 'Файлы картинок в поле `files`.',
    })
    @ApiQuery({
        name: 'dryRun',
        required: false,
        type: Boolean,
        description:
            'true — только проверка, ничего не записывается; false — перенос. ' +
            'Если параметр не указан, выполняется проверка.',
        example: true,
    })
    @ApiOkResponse({
        type: ProviderImageLegacyImportReportDto,
        description:
            'Отчёт: строки по записям `files` и счётчики по итогам. Ошибка записи ' +
            'одной картинки попадает в её строку (`status: error`) и не прерывает остальные.',
    })
    @ApiBadRequestResponse({
        description:
            'Файлы не переданы, запрос не разобран, файл больше 10 МБ, больше 100 файлов или неверное значение dryRun.',
    })
    async legacyImportImages(
        @Query(
            'dryRun',
            new ParseBoolPipe({
                optional: true,
                exceptionFactory: () =>
                    new BadRequestException(
                        PROVIDER_IMAGE_LEGACY_IMPORT_MESSAGES.badDryRun,
                    ),
            }),
        )
        dryRun: boolean | undefined,
        @UploadedFiles() files: Express.Multer.File[] | undefined,
    ): Promise<ProviderImageLegacyImportReportDto> {
        if (!files || files.length === 0) {
            throw new BadRequestException(
                PROVIDER_IMAGE_LEGACY_IMPORT_MESSAGES.noFiles,
            );
        }
        return this.legacyImport.run(
            files.map(file => ({
                name: file.originalname,
                buffer: file.buffer,
            })),
            dryRun ?? true,
        );
    }
}
