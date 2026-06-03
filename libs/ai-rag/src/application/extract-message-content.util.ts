import { BaseMessage } from '@langchain/core/messages';

interface TextLike {
    text?: unknown;
}

export function extractMessageContent(message: BaseMessage): string {
    const content = message.content;

    if (typeof content === 'string') {
        return content;
    }

    if (!Array.isArray(content)) {
        return '';
    }

    return content
        .map(item => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
                const candidate = (item as TextLike).text;
                if (typeof candidate === 'string') return candidate;
            }
            return '';
        })
        .join('');
}
