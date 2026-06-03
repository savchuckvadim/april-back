import { Document } from '@langchain/core/documents';
import { extractResult } from '../application/extract-result.util';

describe('extractResult', () => {
    it('возвращает строку как есть', () => {
        expect(extractResult('hello')).toBe('hello');
    });

    it('берёт answer когда он есть', () => {
        expect(extractResult({ answer: 'ans', output: 'out' })).toBe('ans');
    });

    it('берёт output если нет answer', () => {
        expect(extractResult({ output: 'out' })).toBe('out');
    });

    it('склеивает context если нет answer/output', () => {
        const docs = [
            new Document({ pageContent: 'first' }),
            new Document({ pageContent: 'second' }),
        ];
        expect(extractResult({ context: docs })).toBe('first\n\nsecond');
    });

    it('возвращает пустую строку при отсутствии содержательного поля', () => {
        expect(extractResult({})).toBe('');
    });
});
