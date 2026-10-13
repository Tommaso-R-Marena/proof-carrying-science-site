/** Bounded visual interpretation only; never a PCS checker or training source. */
export function scalar(text){if(typeof text!=='string'||text.length>1024||!/^\d+(?:\/\d+)?$/.test(text))throw Error('Invalid retained scalar.');const [a,b='1']=text.split('/'),value=Number(a)/Number(b);if(!Number.isFinite(value)||Number(b)===0)throw Error('Unsupported scalar.');return value;}
export function loadCase(contract,receipt){
  if(contract?.format!=='pcs-finite-volume-transport-contract-v3'||contract.data_origin!=='synthetic_numerical_computation_not_empirical'
    ||receipt?.format!=='pcs-transport-public-record-v3'||receipt.recorded_result_not_live_verification!==true||receipt.scientific_acceptance!==false
    ||receipt.independent_human_review!==false||receipt.kernel_refinement_of_numerical_adapter!==false||receipt.bounded_contract_satisfied!==true
    ||receipt.pcs_package_valid!==true||receipt.independent_replay_consistent!==true||receipt.domain_replay?.outcome!=='PASS')throw Error('Unsupported recorded case or authority boundary.');
  if(contract.cells.length!==5||contract.edges.length!==6||contract.steps!==16||receipt.domain_replay.trajectory.length!==17)throw Error('Recorded case shape differs.');
  const statuses=new Map(receipt.claims.map(c=>[c.claim_id,c.decision]));
  for(const id of ['C_NUMERICAL','C_CONTINUUM','C_EMPIRICAL'])if(statuses.get(id)!=='OPEN')throw Error('Scientific claim acquired authority.');
  for(const id of ['C_inventory_dimensions','C_flux_dimensions','C_step_dimensions'])if(statuses.get(id)!=='COMPUTATIONALLY_SUPPORTED')throw Error('Recorded dimensions failed.');
  const cells=contract.cells.map(c=>({...c,volumeValue:scalar(c.volume)})),names=cells.map(c=>c.id);
  const edges=contract.edges.map(e=>({...e,leftIndex:names.indexOf(e.left),rightIndex:names.indexOf(e.right),conductanceValue:scalar(e.conductance)}));
  if(edges.some(e=>e.leftIndex<0||e.rightIndex<0||e.leftIndex===e.rightIndex))throw Error('Invalid retained topology.');
  const states=receipt.domain_replay.trajectory.map((row,i)=>{if(row.concentrations.length!==5||row.total_amount_mol!=='7/4'||Math.abs(scalar(row.time_s)-i/4)>1e-12)throw Error('Recorded trajectory accounting differs.');return {...row,values:row.concentrations.map(scalar)};});
  const dt=scalar(contract.time_step),cfl=cells.map((c,i)=>dt*edges.reduce((s,e)=>s+((e.leftIndex===i||e.rightIndex===i)?e.conductanceValue:0),0)/c.volumeValue);
  if(cfl.some(x=>x>1+1e-12))throw Error('Retained case violates the CFL bound.');
  return {cells,edges,states,cfl,dt,verified:false};
}
export function frameData(model,index){if(!Number.isInteger(index)||index<0||index>=model.states.length)throw Error('Frame outside recorded trajectory.');const state=model.states[index],fluxes=model.edges.map(e=>e.conductanceValue*(state.values[e.leftIndex]-state.values[e.rightIndex])),changes=Array(5).fill(0);model.edges.forEach((e,i)=>{changes[e.leftIndex]-=model.dt*fluxes[i];changes[e.rightIndex]+=model.dt*fluxes[i];});return {state,fluxes,nextEstimate:state.values.map((c,i)=>c+changes[i]/model.cells[i].volumeValue),totalAmount:model.cells.reduce((s,c,i)=>s+c.volumeValue*state.values[i],0),verified:false};}
