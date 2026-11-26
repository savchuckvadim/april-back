import { BitrixService } from '@lib/bitrix';
import { RpaCommentHelper } from './rpa-comment-helper.service';

/** Запись в таймлайн RPA — комментарием: только он показывает BB-разметку. */
export const RPA_COMMENT_ADD_METHOD = 'rpa.comment.add';

export interface RpaCommentEntry {
    typeId: number | string;
    itemId: number;
    /** Заголовок записи — первой жирной строкой комментария. */
    title: string;
    /** Тело в BB-коде (`RpaCommentHelper`). */
    description: string;
}

/**
 * Комментарий в таймлайн заявки RPA.
 *
 * Раньше писали `rpa.timeline.add` с HTML; с 26.11.2026 на gsr описание такой
 * записи выводится простым текстом. Автор комментария — пользователь
 * подключения к порталу: указать другого `rpa.comment.add` не позволяет.
 */
export const addRpaComment = async (
    bitrix: BitrixService,
    entry: RpaCommentEntry,
): Promise<void> => {
    await bitrix.api.call(RPA_COMMENT_ADD_METHOD, {
        typeId: entry.typeId,
        itemId: entry.itemId,
        fields: {
            description: RpaCommentHelper.toCommentDescription(
                entry.title,
                entry.description,
            ),
        },
    });
};
