import { timelineLink, timelineText } from '@lib/bitrix/consts/timeline.consts';
import { InitSupplyFlow } from '../dto/init-supply.dto';
import { RpaCommentHelper } from '../services/rpa-timeline-comment/lib/rpa-comment-helper.service';

/**
 * Документы заявки на Диске Битрикса: имена папки и страницы таймлайна,
 * разметка ссылки. Поставка и перезаключение различаются только подписями —
 * тем же правилом, что и название заявки (`buildInitSupplyFlowFields`):
 * поставкой считается только явный `supply`.
 */

/** Подпись ссылки на папку в таймлайне RPA и в комментарии сделки. */
export const DISK_FOLDER_LINK_LABEL = 'Папка на Диске';

const isSupplyFlow = (flow: InitSupplyFlow | undefined): boolean =>
    flow === InitSupplyFlow.SUPPLY;

/** Подпапка заявки в папке сделки: `Поставка 123` или `Перезаключение 123`. */
export const buildDiskFolderName = (
    flow: InitSupplyFlow | undefined,
    rpaId: number | string,
): string => `${isSupplyFlow(flow) ? 'Поставка' : 'Перезаключение'} ${rpaId}`;

/** Заголовок страницы таймлайна RPA со ссылкой на папку. */
export const buildDiskTimelineTitle = (
    flow: InitSupplyFlow | undefined,
): string =>
    isSupplyFlow(flow) ? 'Документы поставки' : 'Документы перезаключения';

/** Страница таймлайна RPA: ссылка «Папка на Диске» и список имён файлов. */
export const buildDiskTimelineEntry = (
    flow: InitSupplyFlow | undefined,
    folderUrl: string,
    fileNames: readonly string[],
): { title: string; description: string } => {
    const link = RpaCommentHelper.getBoldString(
        timelineLink(folderUrl, DISK_FOLDER_LINK_LABEL),
    );
    const list = fileNames.length
        ? RpaCommentHelper.getList(fileNames.map(timelineText), true)
        : '';
    return {
        title: buildDiskTimelineTitle(flow),
        description: `${link}${list}`,
    };
};

/** Строка комментария таймлайна сделки со ссылкой на папку. */
export const buildDiskCommentLine = (folderUrl: string): string =>
    `📁 ${timelineLink(folderUrl, DISK_FOLDER_LINK_LABEL)}`;
