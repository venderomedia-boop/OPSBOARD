import {
  createWorkspaceUser,
  deactivateWorkspaceUser,
  listWorkspaceUsers,
  updateWorkspaceUser,
} from './workflow-store.mjs';

function q(url,key){return url.searchParams.get(key)||undefined;}

export async function handleWorkspaceUserApi(req,res,url,{json,readJson}){
  const p=decodeURIComponent(url.pathname);

  if(req.method==='GET'&&p==='/api/v1/workspace-users'){
    json(200,listWorkspaceUsers({includeInactive:q(url,'includeInactive')==='1'}));
    return true;
  }

  if(req.method==='POST'&&p==='/api/v1/workspace-users'){
    json(201,createWorkspaceUser(await readJson(req)));
    return true;
  }

  const match=p.match(/^\/api\/v1\/workspace-users\/([^/]+)$/);
  if(match&&req.method==='PATCH'){
    json(200,updateWorkspaceUser(match[1],await readJson(req)));
    return true;
  }
  if(match&&req.method==='DELETE'){
    json(200,deactivateWorkspaceUser(match[1]));
    return true;
  }

  return false;
}
