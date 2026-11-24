import {
    BadRequestException,
    CallHandler,
    ExecutionContext,
    HttpException,
    Injectable,
    PayloadTooLargeException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Observable } from 'rxjs';
import { PROVIDER_IMAGE_LEGACY_IMPORT_MESSAGES as MESSAGES } from './provider-image-legacy-import.messages';
import {
    PROVIDER_IMAGE_LEGACY_IMPORT_FIELD,
    PROVIDER_IMAGE_LEGACY_IMPORT_MAX_BYTES,
    PROVIDER_IMAGE_LEGACY_IMPORT_MAX_FILES,
} from './provider-image-legacy-import.types';

/**
 * `preservePath` оставляет в имени файла относительный путь (по умолчанию
 * multer обрезает его до имени): по нему сервер находит запись `files`.
 */
const MulterLegacyImportInterceptor = FilesInterceptor(
    PROVIDER_IMAGE_LEGACY_IMPORT_FIELD,
    PROVIDER_IMAGE_LEGACY_IMPORT_MAX_FILES,
    {
        preservePath: true,
        limits: {
            fileSize: PROVIDER_IMAGE_LEGACY_IMPORT_MAX_BYTES,
            files: PROVIDER_IMAGE_LEGACY_IMPORT_MAX_FILES,
        },
    },
);

/**
 * Разбор multipart-запроса переноса из легаси: поле `files`, до 100 файлов,
 * до 10 МБ каждый. Ошибки multer приходят английским текстом; здесь они
 * превращаются в 400 по-русски, как у остальных загрузок картинок поставщика.
 */
@Injectable()
export class ProviderImageLegacyImportUploadInterceptor extends MulterLegacyImportInterceptor {
    override async intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Promise<Observable<unknown>> {
        try {
            return await super.intercept(context, next);
        } catch (error) {
            if (error instanceof PayloadTooLargeException) {
                throw new BadRequestException(MESSAGES.fileTooLarge);
            }
            if (error instanceof HttpException && error.getStatus() === 400) {
                throw new BadRequestException(MESSAGES.badUpload);
            }
            throw error;
        }
    }
}
