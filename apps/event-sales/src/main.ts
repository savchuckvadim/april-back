import { bootstrapApp } from '@/core';
import { EventSalesModule } from './event-sales.module';

bootstrapApp(EventSalesModule, {
    name: 'event-sales',
    defaultPort: 3005,
}).catch(console.error);
