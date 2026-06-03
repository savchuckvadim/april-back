import { AIMessage } from '@langchain/core/messages';
import { extractMessageContent } from '../application/extract-message-content.util';

describe('extractMessageContent', () => {
    it('возвращает content как строку', () => {
        const message = new AIMessage('Привет');
        expect(extractMessageContent(message)).toBe('Привет');
    });

    it('склеивает массив content-частей с text', () => {
        const message = new AIMessage({
            content: [
                { type: 'text', text: 'Часть 1. ' },
                { type: 'text', text: 'Часть 2.' },
            ],
        });
        expect(extractMessageContent(message)).toBe('Часть 1. Часть 2.');
    });

    it('игнорирует элементы без text', () => {
        const message = new AIMessage({
            content: [
                { type: 'image_url', image_url: 'http://example.com' },
                { type: 'text', text: 'только это' },
            ],
        });
        expect(extractMessageContent(message)).toBe('только это');
    });

    it('возвращает пустую строку для пустого массива', () => {
        const message = new AIMessage({ content: [] });
        expect(extractMessageContent(message)).toBe('');
    });
});
