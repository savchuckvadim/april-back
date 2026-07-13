import { bootstrapApp } from '@lib/core';
import { KonstructorAppModule } from './app.module';

bootstrapApp(KonstructorAppModule, {
    name: 'konstructor',
    defaultPort: 3007,
}).catch(console.error);
