
/** #90: SQL-only search. No CAD/DXF source retrieval or application-wide memo cache. */
import { Prisma } from '@/generated/prisma/client';
import { CadError, resolvedDrawingName } from '@/domain/cad';
import { type MemoSearchQuery,type MemoSearchResult,memoSearchSnippet } from '@/domain/cad-memo-search';
import { type Database,writeTransaction } from '@/server/db';

type Row={
  memoId:string;versionId:string;title:string;content:string;createdById:string;authorName:string;
  updatedAt:string;version:number|bigint;drawingName:string|null;
  originalFilename:string;businessUnit:string;product:string;site:string;siteKind:string;
  building:string;floor:string;isCurrent:number|bigint;
  groupName:string|null;visible:number|bigint;completionEnabled:number|bigint;isCompleted:number|bigint;dueDate:string|null;
};
export class CadMemoSearchRepository{
  constructor(private readonly db:Database){}
  async search(query:MemoSearchQuery,siteIds:readonly string[],featuresAvailable:boolean):Promise<MemoSearchResult>{
    if(!siteIds.length)throw new CadError('ACCESS_DENIED','메모 검색 권한이 없습니다.',403);
    if(!query.q)return {items:[],total:0,page:query.page,pageSize:query.pageSize,featuresAvailable};
    if(!featuresAvailable&&(query.group||query.completion!=='all'||query.dueFrom||query.dueTo))
      throw new CadError('MEMO_SEARCH_FEATURE_UNAVAILABLE','메모 그룹·일정 검색에는 신규 메모 스키마가 필요합니다.',503);
    const featureJoin=featuresAvailable?Prisma.sql`
      LEFT JOIN CadMemoFeature f ON f.memo_id=m.id AND f.version_id=m.version_id AND f.source_sha256=m.source_sha256
      LEFT JOIN CadMemoGroup g ON g.id=f.group_id AND g.version_id=m.version_id AND g.deleted_at IS NULL
    `:Prisma.empty;
    const featureCols=featuresAvailable?Prisma.sql`,
      g.name AS groupName,COALESCE(f.visible,1) AS visible,
      COALESCE(f.completion_enabled,0) AS completionEnabled,
      COALESCE(f.is_completed,0) AS isCompleted,f.due_date AS dueDate`:
      Prisma.sql`,NULL AS groupName,1 AS visible,0 AS completionEnabled,
        0 AS isCompleted,NULL AS dueDate`;
    const from=Prisma.sql`FROM CadMemo m
      JOIN CadFileVersion v ON v.id=m.version_id AND v.sha256=m.source_sha256
      JOIN CadLocation l ON l.id=v.location_id
      JOIN Building bl ON bl.id=l.building_id
      JOIN CadSite s ON s.id=bl.site_id
      JOIN Product p ON p.id=s.product_id
      JOIN BusinessUnit bu ON bu.id=p.business_unit_id
      JOIN "User" author ON author.id=m.created_by_id
      ${featureJoin}`;
    const conditions:Prisma.Sql[]=[
      Prisma.sql`m.deleted_at IS NULL`,
      Prisma.sql`v.file_format='DXF'`,
      Prisma.sql`s.active=1`,
      Prisma.sql`s.id IN (${Prisma.join([...siteIds])})`,
      featuresAvailable?Prisma.sql`(
        instr(lower(m.title),lower(${query.q}))>0 OR
        instr(lower(m.content),lower(${query.q}))>0 OR
        instr(lower(COALESCE(g.name,'')),lower(${query.q}))>0
      )`:Prisma.sql`(
        instr(lower(m.title),lower(${query.q}))>0 OR
        instr(lower(m.content),lower(${query.q}))>0
      )`
    ];
    if(!query.includePast)conditions.push(Prisma.sql`l.current_version_id=v.id`);
    for(const [column,text] of [
      ['bu.name',query.businessUnit],['p.name',query.product],['s.name',query.site],
      ['bl.name',query.building],['l.name',query.floor],
    ] as const){
      if(!text)continue;
      // Static column allowlist, never concatenate user values into SQL.
      switch(column){
        case 'bu.name':conditions.push(Prisma.sql`bu.name=${text}`);break;
        case 'p.name':conditions.push(Prisma.sql`p.name=${text}`);break;
        case 's.name':conditions.push(Prisma.sql`s.name=${text}`);break;
        case 'bl.name':conditions.push(Prisma.sql`bl.name=${text}`);break;
        case 'l.name':conditions.push(Prisma.sql`l.name=${text}`);break;
      }
    }
    if(query.author)conditions.push(Prisma.sql`(
      instr(lower(author.login_name),lower(${query.author}))>0 OR
      instr(lower(m.created_by_id),lower(${query.author}))>0
    )`);
    if(query.group)conditions.push(Prisma.sql`instr(lower(COALESCE(g.name,'')),lower(${query.group}))>0`);
    if(query.completion==='unmanaged')conditions.push(Prisma.sql`COALESCE(f.completion_enabled,0)=0`);
    if(query.completion==='progress')conditions.push(Prisma.sql`f.completion_enabled=1 AND f.is_completed=0`);
    if(query.completion==='completed')conditions.push(Prisma.sql`f.completion_enabled=1 AND f.is_completed=1`);
    if(query.dueFrom)conditions.push(Prisma.sql`f.schedule_enabled=1 AND f.due_date>=${query.dueFrom}`);
    if(query.dueTo)conditions.push(Prisma.sql`f.schedule_enabled=1 AND f.due_date<=${query.dueTo}`);
    const where=Prisma.join(conditions,' AND ');
    const offset=(query.page-1)*query.pageSize;
    return writeTransaction(this.db,async tx=>{
      const totals=await tx.$queryRaw<{total:bigint|number}[]>(
        Prisma.sql`SELECT COUNT(*) AS total ${from} WHERE ${where}`);
      const rows=await tx.$queryRaw<Row[]>(Prisma.sql`SELECT
        m.id AS memoId,m.version_id AS versionId,m.title,m.content,
        m.created_by_id AS createdById,author.login_name AS authorName,m.updated_at AS updatedAt,
        v.version,v.drawing_name AS drawingName,v.original_filename AS originalFilename,
        bu.name AS businessUnit,p.name AS product,s.name AS site,s.kind AS siteKind,
        bl.name AS building,l.name AS floor,
        CASE WHEN l.current_version_id=v.id THEN 1 ELSE 0 END AS isCurrent
        ${featureCols}
        ${from} WHERE ${where}
        ORDER BY m.updated_at DESC,m.id ASC
        LIMIT ${query.pageSize} OFFSET ${offset}`);
      return {
        items:rows.map(row=>({
          memoId:row.memoId,versionId:row.versionId,title:row.title,
          snippet:memoSearchSnippet(row.content,query.q),
          displayName:resolvedDrawingName(row,Number(row.version),row.drawingName),
          version:Number(row.version),isCurrent:Boolean(Number(row.isCurrent)),
          businessUnit:row.businessUnit,product:row.product,site:row.site,
          siteKind:row.siteKind,building:row.building,floor:row.floor,
          createdById:row.createdById,authorName:row.authorName,updatedAt:row.updatedAt,
          groupName:row.groupName,visible:Boolean(Number(row.visible)),
          completionEnabled:Boolean(Number(row.completionEnabled)),
          isCompleted:Boolean(Number(row.isCompleted)),dueDate:row.dueDate,
        })),
        total:Number(totals[0]?.total??0),page:query.page,pageSize:query.pageSize,featuresAvailable,
      };
    });
  }
}
