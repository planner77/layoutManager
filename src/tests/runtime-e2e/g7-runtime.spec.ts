import { expect, test } from '@playwright/test';

test('real signed runtime login, account/site grants, audit and revocation UI',async({page,request},testInfo)=>{
  test.setTimeout(90000);
  const status=await request.get('/api/g7-runtime/status');
  expect(await status.json()).toMatchObject({state:'ACTIVE',authEnabled:true,cadWriteEnabled:true});
  await page.goto('/g7-runtime');
  await expect(page.getByRole('heading',{name:'로그인',exact:true})).toBeVisible();
  await page.getByLabel('계정',{exact:true}).fill('admin-ui');
  await page.getByLabel('비밀번호',{exact:true}).fill('Runtime-admin-153!');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await expect(page.getByRole('heading',{name:'사용자 및 권한 관리'})).toBeVisible();
  await expect(page.getByRole('link',{name:'계정 / 로그인'})).toBeVisible();
  const create=page.getByRole('heading',{name:'사용자 발급'}).locator('..');
  await create.getByLabel('새 사용자 계정').fill('runtime-editor');
  await create.getByLabel('초기 비밀번호').fill('Runtime-editor-153!');
  await create.getByRole('button',{name:'사용자 발급',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('사용자를 발급했습니다');
  await page.getByLabel('관리할 사용자').selectOption({label:'runtime-editor (활성)'});
  const grant=page.getByRole('form',{name:'권한 변경'});
  await grant.getByLabel('대상 권한').selectOption('Editor');
  await grant.getByRole('button',{name:'권한 변경'}).click();
  await expect(page.getByRole('status')).toContainText('권한을 변경했습니다');
  await grant.getByLabel('권한 종류').selectOption('site');
  await grant.getByLabel('대상 권한').selectOption('15300000-0000-4000-8000-000000000003');
  await grant.getByRole('button',{name:'권한 변경'}).click();
  await expect(page.getByRole('status')).toContainText('권한을 변경했습니다');
  await expect(page.getByLabel('관리할 사용자')).toHaveValue(/.+/);
  await page.getByRole('button',{name:'모든 세션 회수'}).click();
  await expect(page.getByRole('status')).toContainText('모든 세션을 회수했습니다');
  await page.getByRole('button',{name:'감사 이력 조회'}).click();
  await expect(page.getByRole('table')).toContainText('ROLE_GRANTED');
  await expect(page.getByRole('table')).toContainText('SITE_GRANTED');
  await page.screenshot({path:testInfo.outputPath('g7-runtime-admin.png'),fullPage:true});
  await page.screenshot({path:'/tmp/layoutmanager-153-ui-admin.png',fullPage:true});
  for (const width of [390,768,1024,1440,1920]) {
    await page.setViewportSize({width,height:900});
    await expect(page.getByRole('button',{name:'로그아웃',exact:true})).toBeVisible();
    const geometry=await page.evaluate(()=>{
      const region=document.querySelector('[aria-label="감사 이력 가로 스크롤"]')!;
      const headers=[...region.querySelectorAll('thead th')].map(cell=>cell.getBoundingClientRect());
      const firstRow=[...region.querySelectorAll('tbody tr:first-child td')].map(cell=>cell.getBoundingClientRect());
      return {overflow:document.documentElement.scrollWidth>window.innerWidth,
        tableScroll:region.scrollWidth>region.clientWidth,
        maxRowHeight:Math.max(...[...region.querySelectorAll('tbody tr')].map(row=>row.getBoundingClientRect().height)),
        aligned:headers.every((cell,index)=>Math.abs(cell.x-firstRow[index].x)<1&&Math.abs(cell.width-firstRow[index].width)<1)};
    });
    expect(geometry.overflow).toBe(false);expect(geometry.aligned).toBe(true);
    expect(geometry.maxRowHeight).toBeLessThanOrEqual(160);
    if(width===390){expect(geometry.tableScroll).toBe(true);await page.screenshot({path:'/tmp/layoutmanager-153-ui-390.png',fullPage:true});}
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();
  await expect(page.getByRole('heading',{name:'로그인',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'초기 비밀번호 변경',exact:true}).click();
  await page.getByLabel('계정',{exact:true}).fill('runtime-editor');
  await page.getByLabel('초기 비밀번호',{exact:true}).fill('Runtime-editor-153!');
  await page.getByLabel('새 비밀번호',{exact:true}).fill('Runtime-editor-new-153!');
  await page.getByRole('button',{name:'비밀번호 변경',exact:true}).click();
  await expect(page.getByRole('heading',{name:'로그인',exact:true})).toBeVisible();
  await page.getByLabel('계정',{exact:true}).fill('runtime-editor');
  await page.getByLabel('비밀번호',{exact:true}).fill('Runtime-editor-new-153!');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await expect(page.getByRole('heading',{name:'현재 세션'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'사용자 및 권한 관리'})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'현재 세션'}).locator('..')).toContainText('Editor');
  // Existing registration and deletion UI now use a fresh server session CSRF.
  await page.goto('/cad/upload');
  for (const [name,value] of [['사업부','15300000-0000-4000-8000-000000000001'],['제품','15300000-0000-4000-8000-000000000002'],['사업장 / 법인','15300000-0000-4000-8000-000000000003'],['동','15300000-0000-4000-8000-000000000004'],['층','15300000-0000-4000-8000-000000000005']]) {
    await page.getByRole('combobox',{name,exact:true}).selectOption(value);
  }
  const bytes=Buffer.from('0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n10\n21\n10\n0\nENDSEC\n0\nEOF\n');
  await page.getByLabel('CAD 파일').setInputFiles({name:'runtime-synthetic.dxf',mimeType:'application/octet-stream',buffer:bytes});
  await page.getByLabel('삭제 비밀번호',{exact:true}).fill('153-delete');
  await page.getByRole('checkbox',{name:'현재 버전으로 지정'}).uncheck();
  const uploaded=page.waitForResponse(response=>response.url().endsWith('/api/cad-files')&&response.request().method()==='POST');
  await page.getByRole('button',{name:'도면 등록',exact:true}).click();
  const response=await uploaded;
  expect(response.status()).toBe(201);
  const file=await response.json();
  const anonymous=await request.get(`/api/cad-files/${file.id}/content`);
  expect(anonymous.status()).toBe(200);expect(await anonymous.body()).toEqual(bytes);
  await page.goto(`/cad/locations/${file.locationId}`);
  const row=page.locator(`[id="version-${file.id}"]`);
  await row.getByRole('button',{name:'Current 지정'}).click();
  await expect(row).toContainText('Current');
  await row.getByRole('button',{name:'삭제',exact:true}).click();
  await page.getByRole('dialog').getByLabel('삭제 비밀번호').fill('153-delete');
  await page.getByRole('button',{name:'삭제 확인',exact:true}).click();
  await expect(row).toHaveCount(0);
  await page.goto('/g7-runtime');
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();
  await expect(page.getByRole('heading',{name:'로그인',exact:true})).toBeVisible();
});
