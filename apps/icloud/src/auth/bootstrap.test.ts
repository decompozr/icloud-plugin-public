import{test,expect}from'bun:test';
import{createBootstrapAccess}from'./bootstrap.js';
test('private setup grants bind trusted login, origin, expiry, ceremony session and unclaimed owner',()=>{
 let enrolled=false,time=1000;const access=createBootstrapAccess({login:'owner@test.invalid',origin:'https://private.test:8443',isEnrolled:()=>enrolled,now:()=>time});
 const req=(login='owner@test.invalid',cookie='',origin='https://private.test:8443')=>new Request('https://private.test:8443/icloud/setup/begin',{method:'POST',headers:{origin,'tailscale-user-login':login,cookie}});
 expect(()=>access.begin(req('other@test.invalid'))).toThrow();expect(()=>access.begin(req(''))).toThrow();expect(()=>access.begin(req(undefined,undefined,'https://evil.test'))).toThrow();
 const cookie=access.begin(req()).split(';')[0]!;expect(cookie).toStartWith('icloud_setup=');
 expect(()=>access.authorize(req())).toThrow();expect(()=>access.authorize(req('other@test.invalid',cookie))).toThrow();
 access.authorize(req(undefined,cookie));access.bind(req(undefined,cookie),'ceremony-owner');
 expect(access.resumed(req(undefined,cookie),'ceremony-owner')).toBe(true);expect(()=>access.authorize(req(undefined,cookie),'other')).toThrow();
 time+=600001;expect(()=>access.authorize(req(undefined,cookie))).toThrow();
 const newCookie=access.begin(req());expect(newCookie).toContain('HttpOnly; Secure; SameSite=Strict');
 enrolled=true;expect(()=>access.begin(req())).toThrow();expect(()=>access.authorize(req(undefined,newCookie.split(';')[0]))).toThrow();
});
