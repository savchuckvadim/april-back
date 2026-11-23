import {
    BadRequestException,
    CallHandler,
    ExecutionContext,
    HttpException,
    Injectable,
    PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Observable } from 'rxjs';
import {
    PROVIDER_IMAGE_MAX_BYTES,
    PROVIDER_IMAGE_MESSAGES,
} from '../provider-image';

/** Поле multipart-запроса, в котором приходит картинка. */
export const PROVIDER_IMAGE_UPLOAD_FIELD = 'file';

const MulterImageInterceptor = FileInterceptor(PROVIDER_IMAGE_UPLOAD_FIELD, {
    limits: { fileSize: PROVIDER_IMAGE_MAX_BYTES, files: 1 },
});

/**
 * Разбор multipart-запроса загрузки картинки поставщика. Лимит размера стоит
 * на уровне multer: файл сверх лимита обрывается на чтении и целиком в память
 * не попадает. Ошибки multer приходят английским текстом и кодом 413; здесь
 * они превращаются в понятный 400 по-русски, как остальные ошибки загрузки.
 */
@Injectable()
export class ProviderImageUploadInterceptor extends MulterImageInterceptor {
    override async intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Promise<Observable<unknown>> {
        try {
            return await super.intercept(context, next);
        } catch (error) {
            if (error instanceof PayloadTooLargeException) {
                throw new BadRequestException(PROVIDER_IMAGE_MESSAGES.tooLarge);
            }
            if (error instanceof HttpException && error.getStatus() === 400) {
                throw new BadRequestException(
                    PROVIDER_IMAGE_MESSAGES.badUpload,
                );
            }
            throw error;
        }
    }
}
