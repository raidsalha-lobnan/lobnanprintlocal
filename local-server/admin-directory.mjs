import crypto from 'node:crypto';
import {InputError} from './sync-domain.mjs';
import {hashPassword,normalizeLogin,stripUserSecrets} from './user-auth.mjs';
const deny=(code,status=422)=>{throw new InputError(code,status)};
const text=(s,max=250)=>typeof s==='string'&&s.trim()&&s.trim().length<=max?s.trim():null;
const safeId=s=>typeof s==='string'&&/^[a-zA-Z0-9_.:-]{1,150}$/.test(s);
const weakPasswords=new Set(['123456','12345678','password','admin123','123456789','qwerty','111111','123123']);
function validatePassword(password,required){
  if(password==null||password==='') {if(required)deny('STRONG_PASSWORD_REQUIRED');return null;}
  if(typeof password!=='string'||password.length<10||password.length>1024||
      weakPasswords.has(password.toLowerCase()))deny('STRONG_PASSWORD_REQUIRED');
  return password;
}
const fingerprint=input=>crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
export async function adminDirectoryCommand(pool,workspace,access,payload){
  if(!access?.admin)deny('ADMIN_REQUIRED',403);
  if(!payload||typeof payload!=='object'||Array.isArray(payload))deny('INVALID_DIRECTORY_COMMAND');
  const requestId=payload.requestId;
  if(!safeId(requestId)||requestId.length<12)deny('REQUEST_ID_REQUIRED');
  const action=payload.action;
  if(!['user.upsert','user.disable','role.upsert','role.delete'].includes(action))deny('INVALID_DIRECTORY_ACTION');
  const key='admin-'+requestId;
  const fp=fingerprint(payload);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('SELECT id FROM sync_workspaces WHERE id=$1 FOR UPDATE',[workspace]);
    const prior=await client.query('SELECT fingerprint,receipt,actor_id FROM sync_commands WHERE workspace=$1 AND command_id=$2',[workspace,key]);
    if(prior.rows.length){
      const p=prior.rows[0];
      if(p.actor_id!==access.profile.id||p.fingerprint!==fp)deny('REQUEST_ID_REUSED',409);
      await client.query('COMMIT');
      return p.receipt;
    }
    let entity,id,value,version;
    if(action.startsWith('user.')){
      const source=payload.profile||{};
      id=payload.id||('user-'+crypto.randomUUID());
      if(!safeId(id))deny('INVALID_USER_ID');
      const old=await client.query("SELECT value,version FROM sync_records WHERE workspace=$1 AND entity='users' AND record_id=$2",[workspace,id]);
      const previous=old.rows[0]?.value;
      if(action==='user.disable'){
        if(!previous)deny('USER_NOT_FOUND',404);
        if(id===access.profile.id)deny('CANNOT_DISABLE_SELF',403);
        const admins=await client.query(`SELECT count(*)::int AS total FROM sync_auth_users u
          JOIN sync_records r ON r.workspace=u.workspace AND r.entity='roles' AND r.record_id=u.role_id
          WHERE u.workspace=$1 AND u.status='active' AND r.value->>'code' IN ('SYS_ADMIN','GEN_MGR')`,[workspace]);
        const existingRole=await client.query("SELECT value->>'code' AS code FROM sync_records WHERE workspace=$1 AND entity='roles' AND record_id=$2",
          [workspace,previous.roleId]);
        if(['SYS_ADMIN','GEN_MGR'].includes(existingRole.rows[0]?.code) && admins.rows[0].total<=1)
          deny('LAST_ADMIN_REQUIRED',403);
        value={...previous,status:'inactive',updatedAt:new Date().toISOString()};
        await client.query("UPDATE sync_auth_users SET status='inactive' WHERE workspace=$1 AND user_id=$2",[workspace,id]);
        await client.query("DELETE FROM sync_auth_sessions WHERE workspace=$1 AND user_id=$2",[workspace,id]);
      }else{
        const username=text(source.username,100),fullName=text(source.fullName,200);
        if(!username||!fullName)deny('USER_NAME_REQUIRED');
        const roleId=text(source.roleId,150),companyId=text(source.companyId,150);
        const branchId=text(source.defaultBranchId,150);
        const branches=source.allowedBranchIds;
        if(!roleId||!companyId||!branchId||!Array.isArray(branches)||!branches.length||
           !branches.every(x=>typeof x==='string'&&x.length<=150))deny('USER_ASSIGNMENT_REQUIRED');
        if(!['active','inactive'].includes(source.status))deny('INVALID_USER_STATUS');
        const role=await client.query("SELECT value FROM sync_records WHERE workspace=$1 AND entity='roles' AND record_id=$2",[workspace,roleId]);
        if(!role.rows[0]?.value)deny('ROLE_NOT_FOUND');
        const company=await client.query("SELECT record_id FROM sync_records WHERE workspace=$1 AND entity='companies' AND record_id=$2",[workspace,companyId]);
        if(!company.rows.length)deny('COMPANY_NOT_FOUND');
        const email=source.email?normalizeLogin(source.email):null;
        const normalized=normalizeLogin(username);
        const candidates=[normalized,email].filter(Boolean);
        const others=await client.query(`SELECT user_id FROM sync_auth_users WHERE workspace=$1 AND user_id<>$2 AND
           (username_normalized=ANY($3::text[]) OR email_normalized=ANY($3::text[]))`,[workspace,id,candidates]);
        if(others.rows.length)deny('DUPLICATE_LOGIN_ALIAS',409);
        const password=validatePassword(payload.password,!previous);
        if(id===access.profile.id && (roleId!==previous?.roleId||source.status!=='active'))deny('CANNOT_CHANGE_OWN_ROLE_OR_STATUS',403);
        value={
          ...(previous||{}),id,username,fullName,
          email:email||undefined,companyId,roleId,roleName:String(role.rows[0].value.name||''),
          defaultBranchId:branchId,allowedBranchIds:branches,status:source.status,
          phone:typeof source.phone==='string'?source.phone.slice(0,100):undefined,
          customPermissions:source.customPermissions&&typeof source.customPermissions==='object'&&!Array.isArray(source.customPermissions)?source.customPermissions:{},
          updatedAt:new Date().toISOString(),createdAt:previous?.createdAt||new Date().toISOString()
        };
        if(!previous){
          await client.query(`INSERT INTO sync_auth_users
           (workspace,user_id,username_normalized,email_normalized,display_name,role_id,status,password_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
           [workspace,id,normalized,email,fullName,roleId,source.status,await hashPassword(password)]);
        }else{
          const pwHash=password?await hashPassword(password):null;
          await client.query(`UPDATE sync_auth_users SET username_normalized=$3,email_normalized=$4,display_name=$5,
           role_id=$6,status=$7,password_hash=COALESCE($8,password_hash)
           WHERE workspace=$1 AND user_id=$2`,[workspace,id,normalized,email,fullName,roleId,source.status,pwHash]);
          if(source.status!=='active'||pwHash)
            await client.query('DELETE FROM sync_auth_sessions WHERE workspace=$1 AND user_id=$2',[workspace,id]);
        }
      }
      entity='users';
      version=old.rows.length?Number(old.rows[0].version)+1:1;
      value=stripUserSecrets(value);
    }else{
      id=payload.id||('role-'+crypto.randomUUID());
      if(!safeId(id))deny('INVALID_ROLE_ID');
      const old=await client.query("SELECT value,version FROM sync_records WHERE workspace=$1 AND entity='roles' AND record_id=$2",[workspace,id]);
      const previous=old.rows[0]?.value;
      if(action==='role.delete'){
        if(!previous)deny('ROLE_NOT_FOUND',404);
        if(previous.isSystem||['SYS_ADMIN','GEN_MGR'].includes(previous.code))deny('SYSTEM_ROLE_PROTECTED',403);
        const count=await client.query('SELECT count(*)::int AS total FROM sync_auth_users WHERE workspace=$1 AND role_id=$2',[workspace,id]);
        if(count.rows[0].total)deny('ROLE_IN_USE',409);
        value=null;
      }else{
        const input=payload.profile||{};
        const code=text(input.code,80),name=text(input.name,160);
        if(!code||!name||!/^[A-Z][A-Z0-9_]*$/i.test(code))deny('INVALID_ROLE_NAME_OR_CODE');
        if(!input.permissions||typeof input.permissions!=='object'||Array.isArray(input.permissions)||
           !Object.values(input.permissions).every(v=>typeof v==='boolean'))deny('INVALID_PERMISSIONS');
        if(previous?.isSystem && previous.code!==code)deny('SYSTEM_ROLE_CODE_IMMUTABLE',403);
        const duplicate=await client.query(`SELECT record_id FROM sync_records WHERE workspace=$1 AND entity='roles'
         AND record_id<>$2 AND value->>'code'=$3`,[workspace,id,code.toUpperCase()]);
        if(duplicate.rows.length)deny('ROLE_CODE_DUPLICATED',409);
        value={...(previous||{}),id,code:code.toUpperCase(),name,
          description:typeof input.description==='string'?input.description.slice(0,400):'',
          isSystem:previous?.isSystem===true,
          permissions:input.permissions,createdAt:previous?.createdAt||new Date().toISOString(),
          updatedAt:new Date().toISOString()};
      }
      entity='roles';
      version=old.rows.length?Number(old.rows[0].version)+1:1;
    }
    if(value===null){
      await client.query('DELETE FROM sync_records WHERE workspace=$1 AND entity=$2 AND record_id=$3',[workspace,entity,id]);
    }else{
      await client.query(`INSERT INTO sync_records(workspace,entity,record_id,version,value)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT(workspace,entity,record_id)
       DO UPDATE SET version=$4,value=$5,updated_at=now()`,[workspace,entity,id,version,JSON.stringify(value)]);
    }
    const change={entity,id,version,value};
    const seq=await client.query('UPDATE sync_workspaces SET next_sequence=next_sequence+1 WHERE id=$1 RETURNING next_sequence',[workspace]);
    const sequence=Number(seq.rows[0].next_sequence);
    const receipt={ok:true,entity,id,value,version,sequence};
    await client.query('INSERT INTO sync_commands(workspace,command_id,fingerprint,receipt,actor_id) VALUES($1,$2,$3,$4,$5)',
      [workspace,key,fp,JSON.stringify(receipt),access.profile.id]);
    await client.query('INSERT INTO sync_events(workspace,sequence,command_id,changes) VALUES($1,$2,$3,$4)',
      [workspace,sequence,key,JSON.stringify([change])]);
    await client.query('COMMIT');
    return receipt;
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{client.release()}
}
