/**
 * Issue #99 private DXF field-acceptance path boundary.
 *
 * No real CAD or report is permitted in the Git checkout, including through
 * symlinks or Windows directory junctions. The private report directory must
 * exist before a run; the report itself is new and created exclusively.
 */
import {lstatSync,realpathSync,writeFileSync} from 'node:fs';
import {basename,dirname,isAbsolute,relative,resolve,sep} from 'node:path';

export type PrivateAcceptancePaths={
  sourceRealPath:string;
  reportPath:string;
  reportDirectoryRealPath:string;
};

function within(root:string,candidate:string):boolean {
  const relativePath=relative(root,candidate);
  return relativePath==='' || (
    relativePath!=='..' &&
    !relativePath.startsWith('..'+sep) &&
    !isAbsolute(relativePath)
  );
}

/** Fail closed before any source read or report output. */
export function validatePrivateAcceptancePaths(
  sourcePath:string,
  reportPath:string,
  repositoryRoot:string,
):PrivateAcceptancePaths {
  if(!isAbsolute(sourcePath)||!isAbsolute(reportPath))
    throw new Error('Private evidence paths must be absolute');
  // Resolve every existing ancestor: lexical path normalization alone does NOT
  // stop /private/alias -> /checkout/repository symlink bypasses.
  const rootReal=realpathSync(repositoryRoot);
  const sourceReal=realpathSync(sourcePath);
  const reportDirectoryReal=realpathSync(dirname(reportPath));
  if(!lstatSync(sourceReal).isFile()||!lstatSync(reportDirectoryReal).isDirectory())
    throw new Error('Private evidence requires a file and an existing report directory');
  if(within(rootReal,sourceReal)||within(rootReal,reportDirectoryReal))
    throw new Error('Private evidence must remain outside the checkout');
  const reportName=basename(reportPath);
  if(reportName==='.'||reportName==='..'||!reportName)
    throw new Error('Invalid private report name');
  // A previous report, a dangling symlink, or a report redirect is never overwritten.
  if(lstatSync(reportPath,{throwIfNoEntry:false})!==undefined)
    throw new Error('Private report path already exists');
  return {sourceRealPath:sourceReal,reportPath,
    reportDirectoryRealPath:reportDirectoryReal};
}

/** Re-check real parent just before creating a new, private report. */
export function writePrivateAcceptanceReport(
  paths:PrivateAcceptancePaths,
  report:string,
):void {
  if(realpathSync(dirname(paths.reportPath))!==paths.reportDirectoryRealPath)
    throw new Error('Private report directory changed during the run');
  // Exclusive creation rejects symlink final components even if added after
  // preflight. Caller must use a restricted, trusted report directory.
  writeFileSync(paths.reportPath,report,{encoding:'utf8',flag:'wx',mode:0o600});
}
