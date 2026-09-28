import {
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
});
