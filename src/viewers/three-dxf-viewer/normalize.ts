/** DXF's optional 2D elevation defaults to zero; upstream requires explicit Z. */
export function explicitElevation(text:string) {
  const lines=text.replace(/\r\n/g,'\n').trimEnd().split('\n');
  const result:string[]=[];
  let record:[number,string][]=[];
  function flush() {
    if(!record.length)return;
    if(['LINE','CIRCLE','ARC','TEXT','MTEXT','INSERT','POINT'].includes(record[0][1].trim())) {
      const codes=new Set(record.map(([code])=>code));
      for(const x of [10,11,12,13,14,15,16,17,18]) if(codes.has(x)&&codes.has(x+10)&&!codes.has(x+20))record.push([x+20,'0']);
    }
    for(const [code,value] of record)result.push(String(code),value);
    record=[];
  }
  for(let i=0;i+1<lines.length;i+=2) {const code=Number(lines[i].trim());if(code===0)flush();record.push([code,lines[i+1]]);}
  flush();return result.join('\n')+'\n';
}
