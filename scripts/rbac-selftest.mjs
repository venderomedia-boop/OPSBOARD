import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'jps-rbac-'));
process.env.JPS_DATA_DIR=temp;

const rbac=await import('./rbac-store.mjs');

const roles=rbac.listRoleTemplates();
assert.equal(roles.length,10,'expected ten JPS role templates');
assert.deepEqual(roles.map(role=>role.id),[
  'owner','operations_manager','finance_manager','compliance_manager','people_admin',
  'office_admin','dispatcher','lead_engineer','engineer','subcontractor',
]);

const ownerReq={headers:{'x-jps-user-id':'workspace-user-1'}};
const owner=rbac.getCurrentWorkspaceUser(ownerReq);
assert.equal(owner.accessLevel,'L5');
assert(owner.permissions.includes('users.assign_roles'));

const engineer=rbac.createWorkspaceUser(ownerReq,{
  name:'Test Engineer',
  email:'engineer@example.test',
  roleIds:['engineer'],
  technicianId:'tech-test',
});
assert.equal(engineer.accessLevel,'L1');
assert.equal(engineer.role,'engineer');
assert(engineer.grants.some(grant=>grant.permission==='jobs.view'&&grant.scope==='own'));
assert(!engineer.permissions.includes('users.view'));

const operations=rbac.createWorkspaceUser(ownerReq,{
  name:'Operations Test',
  email:'ops@example.test',
  roleIds:['operations_manager'],
});
assert.equal(operations.accessLevel,'L4');
assert.equal(
  operations.grants.find(grant=>grant.permission==='purchase_orders.approve_l1')?.approvalLimit,
  2500,
);

const people=rbac.createWorkspaceUser(ownerReq,{
  name:'People Test',
  email:'people@example.test',
  roleIds:['people_admin'],
});
assert.equal(people.accessLevel,'L4');
assert(people.permissions.includes('users.invite'));
assert(!people.permissions.includes('users.assign_roles'));

assert.throws(
  ()=>rbac.createWorkspaceUser({headers:{'x-jps-user-id':people.id}},{
    name:'Privileged Attempt',
    email:'finance@example.test',
    roleIds:['finance_manager'],
  }),
  error=>error?.statusCode===403,
  'people admin must not grant L4/L5 roles without owner approval',
);

assert.throws(
  ()=>rbac.deactivateWorkspaceUser(ownerReq,'workspace-user-1'),
  error=>error?.statusCode===409,
  'final active owner must be protected',
);

const dispatcher=rbac.createWorkspaceUser(ownerReq,{
  name:'Planner Test',
  email:'planner@example.test',
  roleIds:['dispatcher'],
});
const dispatcherReq={headers:{'x-jps-user-id':dispatcher.id}};
assert.doesNotThrow(()=>rbac.requirePermission(dispatcherReq,'jobs.assign'));
assert.throws(()=>rbac.requirePermission(dispatcherReq,'users.edit'),error=>error?.statusCode===403);

const audit=rbac.listRbacAudit();
assert(audit.length>=4,'expected account changes to be audited');

console.log('RBAC self-test passed: roles, levels, approval limits, least privilege, owner protection and audit controls verified.');
