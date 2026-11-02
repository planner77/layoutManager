import type {AppObject,SceneScope} from '../../domain/cad-scene';

/** Integration boundary for #98/#83. These providers must call their own
 * authenticated, scoped APIs. No empty/mock provider is installed by S3/S4. */
export interface SceneBusinessDataProvider<Memo> {
  loadAppObjects(scope:SceneScope,signal:AbortSignal):Promise<readonly AppObject[]>;
  loadMemos(scope:SceneScope,signal:AbortSignal):Promise<readonly Memo[]>;
}
export type SceneBusinessRestoreState =
  | Readonly<{status:'UNAVAILABLE';ownerIssue:98|83}>
  | Readonly<{status:'READY';versionId:string;sourceSha256:string;revision:number}>;
