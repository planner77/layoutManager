import {expect,test} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';

test('TC-Z196-PACKAGING: every Greenfield DDL runtime import is included in the migrator image',()=>{
 const app=path.resolve(import.meta.dirname,'../..');
 const docker=readFileSync(path.join(app,'Dockerfile'),'utf8');
 const stage=docker.split('FROM runtime-base AS migrator\n')[1].split('\nCMD ')[0];
 const copied=[...stage.matchAll(/^COPY --from=builder \/app\/src\/(\S+)\s+\.\/(\S+)$/gm)].map(m=>m[1]);
 const found=new Set<string>();
 for(const entryPath of ['server/g7-operational/greenfield-install.ts','server/g7-operational/greenfield-schema.ts']){
  const source=readFileSync(path.join(app,entryPath),'utf8');
  for(const match of source.matchAll(/import\s+(?!type\b)[\s\S]*?\s+from\s+['"]([^'"]*cad-business\/[^'"]+)['"]/g)){
   const dependency=path.normalize(path.join(path.dirname(entryPath),match[1]+'.ts'));
   expect(existsSync(path.join(app,dependency))).toBe(true);found.add(dependency);
  }
 }
 expect(found.has('server/cad-business/zone-ddl.ts')).toBe(true);
 for(const dependency of found)expect(copied.some(item=>dependency===item||dependency.startsWith(item+'/')),dependency).toBe(true);
 expect(stage).toContain('import { CAD_ZONE_DDL }');
});
