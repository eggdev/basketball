# Database

This package owns the application's Postgres interface and its Neon adapter.
Callers use the Effect `Database` tag for health checks, atomic historical
imports, the historical auction market, and canonical league-member history;
SQL and connection-pool details remain inside the module.

Runtime callers should import from the narrow runtime export:

```ts
import { Database, databaseLayer } from '@fantasy-basketball/database/runtime';
```

Drizzle schema and migration code can import from
`@fantasy-basketball/database/schema`. The package root remains available for
existing internal callers that need both surfaces.

Application traffic uses the pooled `DATABASE_URL`; migrations use the direct
`DATABASE_URL_UNPOOLED` connection.
