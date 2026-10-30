/**
 * Issue #96 P4-D1: deny-first, storage-independent permission contract.
 * This module must receive trusted user/grants from a future server DB adapter;
 * never construct UserAccess from client body, X-User/X-Role or delete password.
 * No app route or Prisma model imports this contract until operating approval.
 */
export type Role = 'Reader' | 'Editor' | 'Admin';
export type SpecialGrant = 'audit:read' | 'logs:read';
export type Action =
  | 'cad:read' | 'cad:upload' | 'cad:current' | 'cad:delete'
  | 'outline:read' | 'outline:write' | 'memo:read' | 'memo:write'
  | 'outlineType:read' | 'outlineType:manage'
  | 'users:manage' | 'grants:manage'
  | SpecialGrant;
export type Resource =
  | Readonly<{ kind: 'global' }>
  | Readonly<{ kind: 'site'; siteId: string }>
  | Readonly<{ kind: 'version'; versionId: string }>;

export type UserAccess = Readonly<{
  id: string;
  status: 'ACTIVE' | 'DISABLED';
  mustChangePassword: boolean;
  roles: readonly Role[];
  siteGrants: readonly string[];
  specialGrants: readonly SpecialGrant[];
}>;

export type ResolveVersionSite = (versionId: string) => Promise<string | null>;

export class AuthorizationError extends Error {
  readonly code = 'ACCESS_DENIED';
  readonly status = 403;
  constructor() { super('접근 권한이 없습니다.'); this.name = 'AuthorizationError'; }
}

const SITE_ACTIONS: readonly Action[] = ['cad:read', 'cad:upload', 'cad:current', 'cad:delete', 'outline:read', 'outline:write', 'memo:read', 'memo:write'];
const GLOBAL_ACTIONS: readonly Action[] = [
  'outlineType:read', 'outlineType:manage', 'users:manage', 'grants:manage',
  'audit:read', 'logs:read',
];

function hasRole(roles: readonly Role[], required: Role) {
  return roles.includes(required);
}

function eligible(user: UserAccess, action: Action) {
  if (action === 'cad:read' || action === 'outline:read' || action === 'memo:read' || action === 'outlineType:read') {
    return user.roles.some(role => role === 'Reader' || role === 'Editor' || role === 'Admin');
  }
  if (action === 'outline:write' || action === 'memo:write' || action === 'cad:upload' ||
      action === 'cad:current' || action === 'cad:delete') return hasRole(user.roles, 'Editor') || hasRole(user.roles, 'Admin');
  if (action === 'outlineType:manage' || action === 'users:manage' || action === 'grants:manage') {
    return hasRole(user.roles, 'Admin');
  }
  if (action === 'audit:read' || action === 'logs:read') {
    return hasRole(user.roles, 'Admin') && user.specialGrants.includes(action);
  }
  return false;
}

/**
 * G4 transactional adapter: call only with a server-resolved Site (including
 * Version -> Location -> Building -> Site), and a freshly loaded DB actor.
 * The legacy public CAD GET bypass remains a separate API policy, NOT an
 * implicit or anonymous UserAccess / SiteGrant.
 */
export function requireResolvedPermission(
  user: UserAccess | null, action: Action, resource: Resource, resolvedSiteId: string | null,
): { siteId: string | null } {
  if (!user || typeof user.id !== 'string' || !user.id.trim() ||
      user.status !== 'ACTIVE' || user.mustChangePassword || !eligible(user, action)) {
    throw new AuthorizationError();
  }
  if (GLOBAL_ACTIONS.includes(action)) {
    if (resource.kind !== 'global') throw new AuthorizationError();
    return { siteId: null };
  }
  if (!SITE_ACTIONS.includes(action) || resource.kind === 'global') throw new AuthorizationError();
  if (resource.kind === 'version' &&
      (typeof resource.versionId !== 'string' || !resource.versionId.trim())) throw new AuthorizationError();
  if (resource.kind === 'site' &&
      (typeof resource.siteId !== 'string' || !resource.siteId.trim())) throw new AuthorizationError();
  if (typeof resolvedSiteId !== 'string' || !resolvedSiteId.trim() ||
      !user.siteGrants.includes(resolvedSiteId)) throw new AuthorizationError();
  return { siteId: resolvedSiteId };
}

/**
 * Site grants must be loaded on the server; a Version is resolved to its
 * authoritative Site by the supplied repository. No implicit global Admin
 * access. Failure to resolve a Version is a denial, never an empty-scope allow.
 */
export async function requirePermission(
  user: UserAccess | null, action: Action, resource: Resource,
  resolveVersionSite: ResolveVersionSite,
): Promise<{ siteId: string | null }> {
  if (!user || typeof user.id !== 'string' || !user.id.trim() ||
      user.status !== 'ACTIVE' || user.mustChangePassword || !eligible(user, action)) {
    throw new AuthorizationError();
  }

  if (GLOBAL_ACTIONS.includes(action)) {
    if (resource.kind !== 'global') throw new AuthorizationError();
    return { siteId: null };
  }
  if (!SITE_ACTIONS.includes(action) || resource.kind === 'global') throw new AuthorizationError();
  let siteId: string | null;
  if (resource.kind === 'site') {
    siteId = resource.siteId;
  } else {
    if (!resource.versionId || typeof resource.versionId !== 'string') throw new AuthorizationError();
    siteId = await resolveVersionSite(resource.versionId);
  }
  if (typeof siteId !== 'string' || !siteId.trim() || !user.siteGrants.includes(siteId)) {
    throw new AuthorizationError();
  }
  return { siteId };
}
