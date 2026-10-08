import test from 'node:test';
import assert from 'node:assert/strict';
import {COUNTERMODEL_MISSIONS,countermodelVerdict,findMinimalCountermodel,initialWorld} from '../public/countermodel-core.mjs';

// Independent finite interpretation oracle: explicit truth tables rather than
// importing the app's AST interpreter or reusing its normalization machinery.
function independentTruth(id,w){
 const {P,Q,R,n}=w;
 const all=(f)=>Array.from({length:n},(_,i)=>i).every(f);
 const any=(f)=>Array.from({length:n},(_,i)=>i).some(f);
 const forward=()=>all(i=>!P[i]||Q[i]);
 switch(id){
 case 'quantifier-switch':return [forward(),any(i=>!P[i]||Q[i])];
 case 'negation-drop':return [all(i=>!P[i]||!Q[i]),forward()];
 case 'implication-flip':return [forward(),all(i=>!Q[i]||P[i])];
 case 'connective-swap':return [any(i=>P[i]&&Q[i]),any(i=>P[i]||Q[i])];
 case 'assumption-loss':return [forward(),all(i=>Q[i])];
 case 'quantifier-scope':return [all(i=>any(j=>R[i][j])),any(j=>all(i=>R[i][j]))];
 case 'variable-capture':return [all(i=>any(j=>R[i][j])),all(i=>R[i][i])];
 default:throw Error('Missing independent finite oracle '+id);
 }
}
function worldFromMask(n,mask,relation){
 const w=initialWorld(n);let bit=0;
 for(let i=0;i<n;i++){w.P[i]=Boolean(mask&(1<<bit++));w.Q[i]=Boolean(mask&(1<<bit++));}
 if(relation)for(let i=0;i<n;i++)for(let j=0;j<n;j++)w.R[i][j]=Boolean(mask&(1<<bit++));
 return w;
}
for(const mission of COUNTERMODEL_MISSIONS){
 test('exhaustive independent finite oracle cross-check: '+mission.id,()=>{
  let independentlyMinimal=null,examples=0;
  for(let n=1;n<=3;n++){
   const bits=2*n+(mission.kind==='relation'?n*n:0);
   for(let mask=0;mask<2**bits;mask++){
    const w=worldFromMask(n,mask,mission.kind==='relation');
    const actual=countermodelVerdict(mission.id,w),[left,right]=independentTruth(mission.id,w);
    assert.deepEqual(actual,{left,right,counterexample:left!==right});
    if(left!==right&&independentlyMinimal===null)independentlyMinimal=n;
    examples++;
   }
  }
  assert.ok(examples>=20);
  assert.equal(findMinimalCountermodel(mission.id).n,independentlyMinimal);
 });
}
