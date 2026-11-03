import { ApiProperty } from '@nestjs/swagger';
import {
    INSTALL_FIELD_FAILURE_REASONS,
    type InstallFieldFailure,
    type InstallFieldFailureReason,
} from '../use-cases/install-field-failure.util';

/**
 * Поле смарта «AI-анализ звонков», которое не удалось создать на портале, —
 * с причиной словами для админки (общий DTO для admin, pbx-install и
 * event-sales).
 */
export class InstallFieldFailureDto implements InstallFieldFailure {
    @ApiProperty({
        description: 'UF-имя поля на портале.',
        example: 'UF_CRM_7_DEAL_PROGRESS',
        type: String,
    })
    fieldName: string;

    @ApiProperty({
        description: 'Название поля по-русски из конфига смарта.',
        example: 'Продвижение сделки по звонку (1-5)',
        type: String,
    })
    title: string;

    @ApiProperty({
        description:
            'Причина: field_limit — портал достиг лимита пользовательских ' +
            'полей Битрикс24 (освободите место и повторите); network — обрыв ' +
            'сети или таймаут (повторите через минуту); other — прочая ошибка ' +
            'Битрикса (см. message).',
        enum: INSTALL_FIELD_FAILURE_REASONS,
        example: 'field_limit',
    })
    reason: InstallFieldFailureReason;

    @ApiProperty({
        description: 'Описание ошибки Битрикса, иначе текст исключения.',
        example:
            'Достигнут лимит пользовательских полей, новое поле не создано.',
        type: String,
    })
    message: string;
}
