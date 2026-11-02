/** Server-owned #65 global catalogue projection. Preview scopeKey is unrelated. */
export type GlobalOutlineTypeDto = Readonly<{
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  updatedById: string;
  scope: 'GLOBAL';
}>;

export type OutlineTypeAccessDto = Readonly<{
  canRead: true;
  canManage: boolean;
  writeEnabled: boolean;
  scope: 'GLOBAL';
}>;

export type OutlineTypePageDto = Readonly<{
  items: GlobalOutlineTypeDto[];
  total: number;
  offset: number;
  limit: number;
}>;
