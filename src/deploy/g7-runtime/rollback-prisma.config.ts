/** #153: unchanged six-CAD migration history, marked disposable clones only. */
import { defineConfig } from 'prisma/config';
import { requireG7S3DisposableTarget } from '../../server/g7-operational/disposable-target';
const target=requireG7S3DisposableTarget(process.env);
export default defineConfig({
  schema:'../../prisma/schema.prisma',migrations:{path:'../../prisma/migrations'},
  datasource:{url:'file:'+target.databasePath},
});
