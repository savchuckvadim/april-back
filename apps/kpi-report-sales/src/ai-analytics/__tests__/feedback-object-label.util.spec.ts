import { AI_LEVERS } from '@lib/sales-ai-analytics';
import {
    AI_LEVER_TITLES,
    FEEDBACK_OBJECT_FALLBACK_LABEL,
    feedbackObjectLabel,
} from '../delivery/feedback-object-label.util';

describe('feedbackObjectLabel — объект обратной связи словами', () => {
    it('звонок, пульс, повестка, строка обзора, сигнал «Внимания», отзыв с сайта', () => {
        expect(feedbackObjectLabel('call:1024')).toBe('по звонку');
        expect(feedbackObjectLabel('pulse')).toBe('по пульсу');
        expect(feedbackObjectLabel('agenda')).toBe('по повестке');
        expect(feedbackObjectLabel('overview:512')).toBe('по строке обзора');
        expect(feedbackObjectLabel('attention:512:risk')).toBe(
            'по сигналу «Внимания»',
        );
        expect(feedbackObjectLabel('site-review:77')).toBe(
            'отзыв с сайта по разбору',
        );
    });

    it('раздел — названием из справочника, чужой код раздела — без названия', () => {
        expect(feedbackObjectLabel('section:PRICE')).toBe(
            'по разделу «Работа по цене»',
        );
        expect(feedbackObjectLabel('section:UNKNOWN')).toBe('по разделу');
    });

    it('подпись стиля — с её заголовком, чужой код подписи — без него', () => {
        expect(feedbackObjectLabel('style:tag:persistent')).toBe(
            'по подписи стиля «дожимает»',
        );
        expect(feedbackObjectLabel('style:tag:nope')).toBe('по подписи стиля');
    });

    it('неизвестный объект — общая подпись, кода в тексте нет', () => {
        expect(feedbackObjectLabel('something:1')).toBe(
            FEEDBACK_OBJECT_FALLBACK_LABEL,
        );
        expect(feedbackObjectLabel('')).toBe(FEEDBACK_OBJECT_FALLBACK_LABEL);
    });

    it('совет — по рычагу из ключа, битый ключ — «по совету» без кода', () => {
        expect(
            feedbackObjectLabel('lever:512:volume:volume-below-capacity:::'),
        ).toBe('по совету «Объём»');
        expect(
            feedbackObjectLabel(
                'lever:512:quality:quality-weak-section:presentation:PRICE:',
            ),
        ).toBe('по совету «Качество»');
        expect(feedbackObjectLabel('lever:512:магия:x:::')).toBe('по совету');
        expect(feedbackObjectLabel('lever:512')).toBe('по совету');
    });

    it('у каждого рычага есть подпись по-русски без кода', () => {
        for (const lever of AI_LEVERS) {
            expect(AI_LEVER_TITLES[lever]).toMatch(/^[А-ЯЁ][а-яё-]+$/);
        }
    });
});
