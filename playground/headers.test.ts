import {test,expect} from 'bun:test';
import {simpleParser} from 'mailparser';

// Research classification only: this neither authorizes nor executes a request.
async function inspect(headers:string) {
  const parsed=await simpleParser(`${headers}\r\nSubject: fixture\r\n\r\nbody`);
  const lines=parsed.headerLines.filter(line=>line.key==='list-unsubscribe');
  if(lines.length!==1)return {kind:lines.length?'ambiguous':'absent',candidates:[]};
  const value=lines[0]!.line.replace(/^[^:]+:/,'').replace(/\r?\n[ \t]+/g,' ');
  const candidates=[...value.matchAll(/<([^<>]+)>/g)].map(match=> {
    try {const url=new URL(match[1]!);return {scheme:url.protocol,url:url.href};}catch{return {scheme:'invalid',url:match[1]!};}
  });
  const post=parsed.headerLines.filter(line=>line.key==='list-unsubscribe-post');
  const oneClick=post.length===1 && post[0]!.line.replace(/^[^:]+:/,'').trim()==='List-Unsubscribe=One-Click';
  return {kind:'candidates',candidates,oneClick};
}

test('real MIME parser preserves folded unsubscribe candidates and one-click marker',async()=> {
 const result=await inspect('List-Unsubscribe: <mailto:leave@example.invalid>,\r\n <https://example.invalid/unsubscribe>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click');
 expect(result.candidates.map(c=>c.scheme)).toEqual(['mailto:','https:']);expect(result.oneClick).toBe(true);
});
test('missing and duplicate unsubscribe headers are distinguished',async()=> {
 expect((await inspect('From: sender@example.invalid')).kind).toBe('absent');
 expect((await inspect('List-Unsubscribe: <https://example.invalid/a>\r\nList-Unsubscribe: <https://example.invalid/b>')).kind).toBe('ambiguous');
});
test('ordinary links, unsupported schemes and malformed URLs do not imply one-click support',async()=> {
 const result=await inspect('List-Unsubscribe: <https://example.invalid/form>, <file:///tmp/mail>, <not a URL>');
 expect(result.oneClick).toBe(false);expect(result.candidates.map(c=>c.scheme)).toEqual(['https:','file:','invalid']);
});
