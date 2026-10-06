/** Pure input validation for the administrator's cursor-based D1 audit feed. */
export function parseAuditPage(params) {
  const kind=params.get("kind")||"all";
  if(!["approvals","admin","all"].includes(kind))throw new RangeError("Unknown audit feed.");
  const defaultLimit={approvals:5,admin:10,all:25}[kind];
  const rawLimit=params.get("limit");
  if(rawLimit!==null&&!/^[1-9][0-9]{0,2}$/.test(rawLimit))throw new RangeError("Invalid audit page size.");
  const limit=rawLimit===null?defaultLimit:Number(rawLimit);
  if(limit>100)throw new RangeError("Audit page size must not exceed 100.");
  const rawBefore=params.get("before_seq");
  if(rawBefore!==null&&!/^[1-9][0-9]{0,15}$/.test(rawBefore))throw new RangeError("Invalid audit cursor.");
  const before=rawBefore===null?null:Number(rawBefore);
  if(before!==null&&(!Number.isSafeInteger(before)||before<1))throw new RangeError("Invalid audit cursor.");
  const query=(params.get("q")||"").trim();
  if(query.length>100)throw new RangeError("Audit search is limited to 100 characters.");
  return {kind,limit,before,query,verify:params.get("verify")==="1"};
}
export function auditSearchPattern(search) {
  return "%"+search.replace(/[\\%_]/g,"\\$&")+"%";
}
