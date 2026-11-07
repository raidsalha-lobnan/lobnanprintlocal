import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createAccessVerifier} from '../access-verifier.mjs';

const teamDomain = 'https://demo-team.cloudflareaccess.com';
const audience = 'test-demo-audience-12345';
const {privateKey,publicKey} = crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const jwk = {...publicKey.export({format:'jwk'}),kid:'test-key',alg:'RS256',use:'sig'};
const now = 1794085000000;
const fetcher=async () => ({ok:true,json:async()=>({keys:[jwk]})});
const verify=createAccessVerifier({teamDomain,audience,fetcher,now:()=>now});
const enc=data=>Buffer.from(JSON.stringify(data)).toString('base64url');
function makeJwt(payload={},header={}) {
  const h=enc({alg:'RS256',kid:'test-key',typ:'JWT',...header});
  const p=enc({iss:teamDomain,aud:[audience],exp:Math.floor(now/1000)+1800,sub:'tester',...payload});
  const sig=crypto.sign('RSA-SHA256',Buffer.from(h+'.'+p),privateKey).toString('base64url');
  return h+'.'+p+'.'+sig;
}
test('allows a verified and non-expired Cloudflare Access JWT',async()=>{
  const identity=await verify(makeJwt());
  assert.equal(identity.sub,'tester');
});
test('rejects token missing, invalid signature or wrong signing algorithm',async()=>{
  await assert.rejects(verify(''),/ACCESS_JWT_MISSING/);
  const parts=makeJwt().split('.');
  parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);
  await assert.rejects(verify(parts.join('.')),/ACCESS_SIGNATURE_REJECTED/);
  await assert.rejects(verify(makeJwt({}, {alg:'none'})),/ACCESS_ALG_REJECTED/);
});
test('rejects wrong audience, issuer, expired token and token not yet valid',async()=>{
  await assert.rejects(verify(makeJwt({aud:['other-app']})),/ACCESS_CLAIMS_REJECTED/);
  await assert.rejects(verify(makeJwt({iss:'https://evil.example'})),/ACCESS_CLAIMS_REJECTED/);
  await assert.rejects(verify(makeJwt({exp:Math.floor(now/1000)-1})),/ACCESS_CLAIMS_REJECTED/);
  await assert.rejects(verify(makeJwt({nbf:Math.floor(now/1000)+300})),/ACCESS_CLAIMS_REJECTED/);
});
test('fails closed for invalid configuration and unavailable public keys',async()=>{
  assert.throws(()=>createAccessVerifier({teamDomain:'http://bad',audience}),/CF_ACCESS_TEAM_DOMAIN/);
  const failed=createAccessVerifier({teamDomain,audience,fetcher:async()=>({ok:false}),now:()=>now});
  await assert.rejects(failed(makeJwt()),/ACCESS_JWKS_UNAVAILABLE/);
});
