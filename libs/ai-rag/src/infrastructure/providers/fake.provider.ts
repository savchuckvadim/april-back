import { Injectable } from '@nestjs/common';
import { LlmProvider } from '../../domain/interfaces/llm-provider.interface';

const FAKE_RESUME = `Я провел презентацию нашего продукта и предложил варианты автоматизации для их бизнеса. Клиент сначала выразил интерес, но при уточнении деталей стал скептичен. Я объяснил ценность решения для бухгалтерии, однако клиент ответил, что у них уже есть свои инструменты. В итоге договорились вернуться к обсуждению позже при появлении потребности.`;

const FAKE_RECOMENDATION = `Менеджеру стоит сначала зафиксировать ценность для собеседника, затем задавать уточняющие вопросы по процессам клиента, и только после этого переходить к презентации. При возражении "зачем" лучше коротко объяснить пользу на языке клиента и предложить конкретный следующий шаг: демо, кейс или короткий повторный звонок.`;

@Injectable()
export class FakeProvider implements LlmProvider {
    resume(query: string, domain?: string): Promise<string> {
        void query;
        void domain;
        return Promise.resolve(FAKE_RESUME);
    }

    recomendation(query: string, domain?: string): Promise<string> {
        void query;
        void domain;
        return Promise.resolve(FAKE_RECOMENDATION);
    }
}
