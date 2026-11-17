import { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';
import { contentWidth, type OfferPdfTheme } from '../theme/offer-pdf-theme';
import { buildDefaultAppeal, buildDefaultLetterText } from './letter-default';
import { recipientLines } from './letter.util';

/**
 * Высота письма до раскладки — чтобы решить, встанет ли под ним таблица цен
 * («сначала цена»). Оценка с запасом: символ считается шире, чем он есть,
 * поэтому строк выходит не меньше настоящего.
 */

/** Средняя ширина символа в долях кегля — заведомо больше настоящей */
const CHAR_WIDTH = 0.6;
/** Отступ под строкой с датой и адресатом, под обращением и между абзацами */
const RQ_GAP = 16;
const APPEAL_GAP = 8;
const PARAGRAPH_GAP = 6;

const plain = (text: string): string =>
    text.replace(/\\n/g, '\n').replace(/<[^>]+>/g, '');

const linesOf = (text: string, perLine: number): number =>
    plain(text)
        .split('\n')
        .reduce(
            (sum, part) => sum + Math.max(1, Math.ceil(part.length / perLine)),
            0,
        );

/** Оценка высоты письма в пунктах (без подписи: она идёт отдельным разделом) */
export const estimateLetterHeight = (
    theme: OfferPdfTheme,
    model: OfferPdfDocumentModel,
): number => {
    const { data, letter } = model;
    const { sizes, lineHeight, surface } = theme;
    const card = surface ? surface.padding * 2 : 0;
    const width = contentWidth(theme) - card;
    const perLine = Math.max(20, Math.floor(width / (sizes.lg * CHAR_WIDTH)));
    const line = (size: number): number => size * lineHeight;

    const appeal = letter.appeal ?? buildDefaultAppeal(data);
    const text = letter.text ?? buildDefaultLetterText(data);
    const paragraphs = plain(text).split('\n').length;

    const rq =
        Math.max(1, recipientLines(data).length) * line(sizes.sm) + RQ_GAP;
    const appealHeight = appeal
        ? linesOf(appeal, perLine) * line(sizes.lg) + APPEAL_GAP
        : 0;
    const body =
        linesOf(text, perLine) * line(sizes.lg) + paragraphs * PARAGRAPH_GAP;

    return Math.ceil(card + rq + appealHeight + body);
};
