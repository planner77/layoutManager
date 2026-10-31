import type { GeoJSONOutline } from '@/viewers/core/outline-compute';

/** Authorized Version-bound projection of the global type catalogue. */
export type OutlineTypeChoice = Readonly<{
  id: string; name: string; active: true; sortOrder: number; revision: number;
}>;
export type ReferencedOutlineType = Readonly<Omit<OutlineTypeChoice, 'active'> & {active: boolean}>;
export type AuthorizedOutlineCatalog = Readonly<{
  actorId: string; versionId: string; sourceSha256: string;
  sceneRevision: number | null; catalogScope: 'GLOBAL'; canCreate: boolean;
  items: OutlineTypeChoice[]; total: number; offset: number; limit: number;
}>;

export type StoredOutlineDto = Readonly<{
  id: string; versionId: string; sourceSha256: string; sceneRevision: number;
  origin: 'APP_CREATED'; validationMode: 'APP_CREATED' | 'SOURCE_CANONICAL';
  kind: 'CONVEX' | 'PRECISE'; name: string;
  geometry: GeoJSONOutline; baseGeometry: GeoJSONOutline;
  sourceRefs: string[]; derivedFrom: string[];
  operations: ReadonlyArray<
    {type:'Translate';dx:number;dy:number} | {type:'Rotate';angleDegrees:number;pivot:[number,number]}
  >;
  outlineTypeId: string | null; outlineType: ReferencedOutlineType | null;
  createdById: string; updatedById: string; createdAt: string; updatedAt: string;
  revision: number;
}>;
export type StoredOutlinePageDto = Readonly<{
  actorId: string; versionId: string; sourceSha256: string;
  sceneRevision: number | null; canWrite: boolean;
  total: number; offset: number; limit: number; outlines: StoredOutlineDto[];
}>;
export type StoredOutlineCreateDto = Readonly<{
  sourceSha256: string; expectedSceneRevision: number; name: string;
  kind: 'CONVEX' | 'PRECISE'; outlineTypeId: string;
} & (
  {mode: 'APP_CREATED'; geometry: GeoJSONOutline; derivedFrom?: string[]} |
  {mode: 'SOURCE_CANONICAL'; sourceExport: unknown}
)>;
export type StoredOutlineCreateResultDto = StoredOutlineDto & Readonly<{replayed: boolean}>;
