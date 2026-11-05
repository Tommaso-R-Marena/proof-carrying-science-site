"""Independent small-intent parser/compiler. It cannot provide Lean authorization."""
import json,re

def decode(raw):
 if not isinstance(raw,str) or len(raw.encode('utf-16-le'))//2>128:raise ValueError('intent size')
 def pairs(ps):
  d={}
  for k,v in ps:
   if k in d:raise ValueError('duplicate')
   d[k]=v
  return d
 def number(_):raise ValueError('number')
 v=json.loads(raw,object_pairs_hook=pairs,parse_int=number,parse_float=number,parse_constant=number)
 if not isinstance(v,dict) or set(v)!= {'value'} or not isinstance(v['value'],str) or not re.fullmatch(r'(0|[1-9][0-9]{0,6})',v['value']) or int(v['value'])>1000000:raise ValueError('canonical integer')
 return int(v['value'])

def compile_intent(spec,target,raw):
 n=decode(raw);p=spec['policy'];f,r=target['fileId'],target['rowId']
 eligible=target in p['editable'] and p['minimum']<=n<=p['maximum'] and (not p['requireInspection'] or f in p['inspectable'])
 actions=([{'tool':'inspect_file','args':{'fileId':f}}] if p['requireInspection'] else [])+[{'tool':'set_value','args':{**target,'value':str(n)}}]
 return {'value':str(n),'eligible':eligible,'plan':{'actions':actions} if eligible else None}
