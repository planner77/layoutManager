/** Private opt-in acceptance; NOT referenced by the default PR CI.
 * Requires a locally authorized DXF and a production build.
 * CAD_OUTLINE_ACCEPTANCE_DXF=/private/sample.dxf \
 * CAD_OUTLINE_ACCEPTANCE_REPORT_PATH=/private/result.json \
 * npx playwright test --config playwright.outline-acceptance.config.ts
 */
import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig(base,{
  testMatch:'**/outline.acceptance.ts',
  timeout:15*60*1000,
  workers:1,
  retries:0,
});
