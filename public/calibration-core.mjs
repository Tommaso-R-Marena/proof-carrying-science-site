// Exact, bounded browser arithmetic for inspecting recorded evidence.
// This is an independent calculator; it does not execute Lean or confer authority.
const fail = message => { throw Error(message); };
const abs = n => n < 0n ? -n : n;
const gcd = (a,b) => {a=abs(a);b=abs(b);while(b){[a,b]=[b,a%b];}return a;};
export function rational(text){
  if(typeof text!=='string'||text.length>160||! /^-?(?:0|[1-9][0-9]*)(?:\/[1-9][0-9]*)?$/.test(text))fail('Bounded canonical rational required');
  const [n,d='1']=text.split('/'),a=BigInt(n),b=BigInt(d),g=gcd(a,b);
  if(g!==1n||text==='-0'||(text.includes('/')&&b===1n)||a===0n&&text!=='0')fail('Noncanonical rational');
  return [a,b];
}
const norm=(a,b)=>{if(!b)fail('Zero denominator');if(b<0n){a=-a;b=-b;}const g=gcd(a,b);return [a/g,b/g];};
const add=(a,b)=>norm(a[0]*b[1]+b[0]*a[1],a[1]*b[1]);
const mul=(a,b)=>norm(a[0]*b[0],a[1]*b[1]);
const sub=(a,b)=>add(a,[-b[0],b[1]]);
const equal=(a,b)=>a[0]===b[0]&&a[1]===b[1];
const le=(a,b)=>a[0]*b[1]<=b[0]*a[1];
const sum=xs=>xs.reduce(add,[0n,1n]);
const power=(x,n)=>[x[0]**BigInt(n),x[1]**BigInt(n)];
const magnitude=x=>[abs(x[0]),x[1]];
export const text=x=>x[1]===1n?String(x[0]):x[0]+'/'+x[1];
export const decimal=x=>Number(x[0])/Number(x[1]);
const requireEqual=(a,b,message)=>{if(!equal(a,b))fail(message);};
const dot=(a,b)=>{if(a.length!==b.length)fail('Vector length mismatch');return sum(a.map((v,i)=>mul(v,b[i])));};
const polynomial=(b,x)=>sum(b.map((c,i)=>mul(c,power(x,i))));
function parsedModel(m,n,degree,queries){
  if(!m||m.degree!==degree||!Array.isArray(m.data)||m.data.length!==n||m.coefficients.length!==degree+1||m.query_x.length!==queries||m.queries.length!==queries)fail('Fixed experiment model shape differs');
  const data=m.data.map(row=>{if(!Array.isArray(row)||row.length!==2)fail('Malformed observation');return row.map(rational);});
  const b=m.coefficients.map(rational), residual=data.map(([x,y])=>sub(polynomial(b,x),y));
  for(let j=0;j<=degree;j++)requireEqual(sum(data.map(([x],i)=>mul(power(x,j),residual[i]))),[0n,1n],'Normal equation failed');
  requireEqual(sum(residual.map(e=>mul(e,e))),rational(m.sse),'Residual SSE failed');
  for(let q=0;q<queries;q++){
    const x=rational(m.query_x[q]),w=m.queries[q];
    for(const which of ['least_squares','minimax']){
      const candidate=which==='minimax'?w.minimax:w;
      if(!candidate||candidate.weights.length!==n||candidate.dual.length!==degree+1)fail('Malformed primal/dual witness');
      const weights=candidate.weights.map(rational),dual=candidate.dual.map(rational);
      for(let j=0;j<=degree;j++)requireEqual(dot(weights,data.map(([xi])=>power(xi,j))),power(x,j),'Polynomial reproduction failed');
      const gain=rational(candidate.gain);
      requireEqual(sum(weights.map(magnitude)),gain,'Gain witness failed');
      if(which==='least_squares'){
        data.forEach(([xi],i)=>requireEqual(weights[i],polynomial(dual,xi),'Least-squares dual failed'));
      }else{
        if(data.some(([xi])=>!le(magnitude(polynomial(dual,xi)),[1n,1n])))fail('Minimax dual feasibility failed');
        requireEqual(polynomial(dual,x),gain,'Minimax dual objective failed');
      }
    }
  }
  return {data,b};
}
export function inspectCase(c,degree=3,query=0,epsilon='1/100'){
  if(!c||!/^hull-(?:0[0-9]|1[0-9]|2[01])$/.test(c.id)||!Array.isArray(c.models)||c.models.length!==6||![1,2,3].includes(degree)||!Number.isInteger(query)||query<0||query>7||!['0','1/1000','1/100'].includes(epsilon))fail('Unsupported fixed experiment selection');
  const parsed=c.models.map((m,i)=>parsedModel(m,i%2?14:7,Math.floor(i/2)+1,i%2?0:8));
  const full=parsed[1].data;
  for(let i=0;i<6;i++){
    const expected=i%2?full:full.filter((_,k)=>k%2===0);
    if(JSON.stringify(c.models[i].data)!==JSON.stringify(expected.map(row=>row.map(text))))fail('Training split or response substitution');
    if(i%2===0){
      const queries=[...full.filter((_,k)=>k%2===1).map(([x])=>text(x)),'24'];
      if(JSON.stringify(c.models[i].query_x)!==JSON.stringify(queries))fail('Query grid substitution');
    }
  }
  const index=2*(degree-1),m=c.models[index],fitted=parsed[index],heldout=full.filter((_,i)=>i%2===1);
  const predictions=m.queries.map((q,i)=>({x:rational(m.query_x[i]),
    least_squares:dot(q.weights.map(rational),fitted.data.map(([,y])=>y)),
    minimax:dot(q.minimax.weights.map(rational),fitted.data.map(([,y])=>y))}));
  const score=kind=>sum(heldout.map(([,y],i)=>{const e=sub(predictions[i][kind],y);return mul(e,e);}));
  const selected=m.queries[query],eps=rational(epsilon),fullSSE=rational(c.models[index+1].sse);
  const budget=mul([14n,1n],mul(eps,eps));
  return {id:c.id,degree,observations:full.map(([x,y],i)=>({x:decimal(x)/40,y:decimal(y),training:i%2===0})),
    predictions:predictions.map(p=>({x:decimal(p.x)/40,least_squares:decimal(p.least_squares),minimax:decimal(p.minimax)})),
    scores:{least_squares:text(score('least_squares')),minimax:text(score('minimax'))},
    selected_query:query,epsilon,least_squares_gain:selected.gain,minimax_gain:selected.minimax.gain,
    least_squares_radius:text(mul(eps,rational(selected.gain))),minimax_radius:text(mul(eps,rational(selected.minimax.gain))),
    full_data_sse:text(fullSSE),full_data_budget:text(budget),joint_model_budget_excluded:!le(fullSSE,budget),
    kernel_executed:false,scientific_acceptance:false,pcs_authority:false};
}
export function validateView(view){
  if(view?.format!=='pcs-calibration-public-view-v1'||view.scientific_acceptance!==false||view.pcs_authority!==false||view.recorded_result_not_live_verification!==true||view.hull_groups!==22||view.distinct_response_curves!==21||view.observations!==308||view.heldout_observations!==154||!Array.isArray(view.cases)||view.cases.length!==22)fail('Recorded research scope mismatch');
  const curves=new Set();
  view.cases.forEach((c,i)=>{if(c.id!==`hull-${String(i).padStart(2,'0')}`)fail('Hull ordering mismatch');curves.add(JSON.stringify(c.models[1].data.map(row=>row[1])));});
  if(curves.size!==21)fail('Duplicate response disclosure mismatch');
  for(const degree of [1,2,3]){
    let ls=[0n,1n],mm=[0n,1n];
    for(const c of view.cases){const r=inspectCase(c,degree);ls=add(ls,rational(r.scores.least_squares));mm=add(mm,rational(r.scores.minimax));if(!le(rational(r.scores.minimax),rational(r.scores.least_squares))||!r.joint_model_budget_excluded)fail('Recorded comparison or exclusion failed');}
    requireEqual(ls,rational(view.pooled_heldout_sse[degree]),'Pooled least-squares score differs');
    requireEqual(mm,rational(view.minimax_pooled_heldout_sse[degree]),'Pooled minimax score differs');
  }
  return view;
}
