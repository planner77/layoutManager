export type PublicSessionStatus={kind:'checking'|'signed-in'|'login-required'|'off'|'blocked'|'unavailable';roles:string[]};
export const checking:PublicSessionStatus={kind:'checking',roles:[]};
const knownRoles=['Admin','Editor','Reader'];

export function gateStatus(value:unknown):'active'|'off'|'blocked'|'unavailable'{ 
  if(!value||typeof value!=='object')return 'unavailable';
  const gate=value as Record<string,unknown>;
  if(gate.state==='OFF'&&gate.authEnabled===false)return 'off';
  if(gate.state==='BLOCKED')return 'blocked';
  if(gate.state==='ACTIVE'&&gate.authEnabled===true)return 'active';
  return 'unavailable';
}
export function sessionStatus(httpStatus:number,value:unknown):PublicSessionStatus{
  if(httpStatus===401)return {kind:'login-required',roles:[]};
  if(httpStatus!==200||!value||typeof value!=='object')return {kind:'unavailable',roles:[]};
  const actor=(value as Record<string,unknown>).actor;
  if(!actor||typeof actor!=='object')return {kind:'unavailable',roles:[]};
  const fields=actor as Record<string,unknown>;
  const roleValues=fields.roles;
  if(fields.status!=='ACTIVE'||typeof fields.id!=='string'||!fields.id||
    !Array.isArray(roleValues)||roleValues.length===0||
    !roleValues.every(role=>typeof role==='string'))return {kind:'unavailable',roles:[]};
  const roles=knownRoles.filter(role=>roleValues.includes(role));
  return roles.length?{kind:'signed-in',roles}:{kind:'unavailable',roles:[]};
}
