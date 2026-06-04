import { bootstrapApp } from '@/core';
import { EventServiceModule } from './event-service.module';

bootstrapApp(EventServiceModule, {
    name: 'event-service',
    defaultPort: 3006,
}).catch(console.error);
