// Administrative directory and aggregate counts only. No conversations,
// credentials, company profiles or generation payloads enter this response.
export async function adminOverview(db){
 const clients=await db.prepare('SELECT id,name,created_at FROM companies ORDER BY created_at DESC').all();
 const jobs=await db.prepare('SELECT org_id,state,COUNT(*) AS total FROM jobs GROUP BY org_id,state').all();
 const records=await db.prepare("SELECT org_id,kind,json_extract(data,'$.state') AS state,COUNT(*) AS total FROM records WHERE kind IN ('assisted_request','consultation','commercial_interest','commercial_offer') GROUP BY org_id,kind,json_extract(data,'$.state')").all();
 const sum=(rows,fn)=>rows.filter(fn).reduce((n,r)=>n+Number(r.total),0);
 return {asOf:Date.now(),clients:clients.map(c=>({id:c.id,name:c.name,createdAt:c.created_at,failedJobs:sum(jobs,r=>r.org_id===c.id&&r.state==='failed'),runningJobs:sum(jobs,r=>r.org_id===c.id&&['queued','working','waiting_provider'].includes(r.state)),publicationRequests:sum(records,r=>r.org_id===c.id&&r.kind==='assisted_request'&&!['published','canceled'].includes(r.state)),consultations:sum(records,r=>r.org_id===c.id&&r.kind==='consultation'&&!['draft','completed','canceled'].includes(r.state))})),totals:{clients:clients.length,publications:sum(records,r=>r.kind==='assisted_request'&&!['published','canceled'].includes(r.state)),consultations:sum(records,r=>r.kind==='consultation'&&!['draft','completed','canceled'].includes(r.state)),newInterests:sum(records,r=>r.kind==='commercial_interest'&&r.state==='new'),proposals:sum(records,r=>r.kind==='commercial_offer'&&r.state==='sent'),failedJobs:sum(jobs,r=>r.state==='failed')}};
}
