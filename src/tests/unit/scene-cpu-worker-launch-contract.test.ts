import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runCpuWorkerTick} from '../../scripts/scene-cpu-worker';
afterEach(()=>vi.unstubAllEnvs());
describe('#225 isolated CPU Worker launch boundary',()=>{
  it('rejects an unapproved configuration before touching the database',async()=>{
    await expect(runCpuWorkerTick({
      G7_GREENFIELD_MODE:'true',G7_GREENFIELD_AUTOMATED:'true',
      CAD_STORAGE_BACKEND:'local',SCENE_AUTO_BUILD_ENABLED:'false',
      SCENE_CPU_WORKER_ENABLED:'true',
    } as NodeJS.ProcessEnv)).rejects.toThrow('SCENE_CPU_WORKER_CONFIGURATION_DENIED');
    await expect(runCpuWorkerTick({
      G7_GREENFIELD_MODE:'true',G7_GREENFIELD_AUTOMATED:'true',
      CAD_STORAGE_BACKEND:'s3',SCENE_AUTO_BUILD_ENABLED:'true',
      SCENE_CPU_WORKER_ENABLED:'true',
    } as NodeJS.ProcessEnv)).rejects.toThrow('SCENE_CPU_WORKER_CONFIGURATION_DENIED');
  });
  it('keeps Worker opt-in, bounded, unprivileged and without a network',()=>{
    const compose=readFileSync(new URL('../../docker-compose.yml',import.meta.url),'utf8');
    const docker=readFileSync(new URL('../../Dockerfile',import.meta.url),'utf8');
    const loop=readFileSync(new URL('../../scripts/scene-cpu-worker-loop.sh',import.meta.url),'utf8');
    expect(compose).toContain('profiles: ["scene-cpu-worker"]');
    for(const line of ['read_only: true','network_mode: none',
      'cap_drop: ["ALL"]','pids_limit: 64','mem_limit: 768m','cpus: 1.0',
      'no-new-privileges:true','SCENE_CPU_WORKER_ENABLED: "${SCENE_CPU_WORKER_ENABLED:-false}"'])
      expect(compose).toContain(line);
    expect(docker).toContain('FROM runtime-base AS cpu-worker');
    expect(docker).toContain('USER cad');
    expect(loop).toContain('timeout -k 5s 120s');
  });
});
