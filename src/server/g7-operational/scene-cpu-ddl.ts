/** #225/B2-B: forward-only CPU Worker release index. The existing
 * 0.60.0 SceneBuildJob schema and its checksums are never modified.
 */
import {createHash} from 'node:crypto';
export const SCENE_CPU_MIGRATION_NAME='202611040003_scene_cpu_worker' as const;
export const SCENE_CPU_INDEX_DDL={
  type:'index' as const,name:'ix_scene_build_cpu_due',
  sql:'CREATE INDEX "ix_scene_build_cpu_due" ON "SceneBuildJob"("builder","status","due_at")',
};
export const SCENE_CPU_OBJECT_NAMES=new Set<string>([SCENE_CPU_INDEX_DDL.name]);
export const SCENE_CPU_MIGRATION_SQL=SCENE_CPU_INDEX_DDL.sql+';\n';
export const SCENE_CPU_MIGRATION_CHECKSUM=createHash('sha256')
  .update(SCENE_CPU_MIGRATION_SQL).digest('hex');
