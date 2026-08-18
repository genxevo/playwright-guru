/**
 * Playwright Guru — DevTools Panel
 * Mirrors SidePanel layout. Gets element data via chrome.devtools.inspectedWindow.eval($0).
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { generateLocatorCode, type TargetLanguage } from '@playwright-guru/codegen';
import { buildCandidateSteps, scoreCandidate, type ScoredCandidate, type ElementAttributes } from '@playwright-guru/locator-engine';
import {
  generateCSS, generateXPath, generateAllCSSVariants, generateAllXPathVariants,
  toLocatorCode, toXPathLocatorCode,
  CSS_SUB_TABS, XPATH_SUB_TABS, RELIABILITY_COLORS,
  type CSSSubTab, type XPathSubTab, type CSSVariant, type XPathVariant,
} from '../../utils/css-xpath';

type MainTab = 'playwright' | 'css' | 'xpath';
type PwLang  = TargetLanguage;
interface ActionOption { label: string; value: string; hint: string }

const ALL_GETBY_KINDS = [
  { kind:'role'as const,        label:'getByRole',        color:'#16a34a', naReason:'No ARIA role detected.' },
  { kind:'label'as const,       label:'getByLabel',       color:'#16a34a', naReason:'No <label> associated.' },
  { kind:'placeholder'as const, label:'getByPlaceholder', color:'#2563eb', naReason:'No placeholder attribute.' },
  { kind:'text'as const,        label:'getByText',        color:'#2563eb', naReason:'No visible text — use getByRole for interactive elements.' },
  { kind:'altText'as const,     label:'getByAltText',     color:'#7c3aed', naReason:'No alt attribute — only for <img>.' },
  { kind:'title'as const,       label:'getByTitle',       color:'#6b7280', naReason:'No title attribute.' },
  { kind:'testId'as const,      label:'getByTestId',      color:'#d97706', naReason:'No data-testid found. ★ Add one!' },
];
const STRATEGY_COLORS: Record<string,string> = {role:'#16a34a',label:'#16a34a',placeholder:'#2563eb',text:'#2563eb',altText:'#7c3aed',title:'#6b7280',testId:'#d97706'};
const STRATEGY_LABELS: Record<string,string> = {role:'getByRole',label:'getByLabel',placeholder:'getByPlaceholder',text:'getByText',altText:'getByAltText',title:'getByTitle',testId:'getByTestId'};
const LANGS: Array<{label:string;value:PwLang}> = [
  {label:'TypeScript',value:'typescript'},
  {label:'JavaScript',value:'javascript'},
  {label:'Python',value:'python_sync'},
  {label:'Java',value:'java'},
  {label:'C#',value:'csharp_async'},
];
const NO_ACTION: ActionOption = {label:'No action',value:'none',hint:''};
const ACTION_MAP: Record<string,[string,string,string,string]> = {
  click:[".click()",".click()",".click()",".ClickAsync()"],
  fill:[".fill('')",'.fill("")','.fill("")','.FillAsync("")'],
  clear:[".clear()",".clear()",".clear()",".ClearAsync()"],
  check:[".check()",".check()",".check()",".CheckAsync()"],
  uncheck:[".uncheck()",".uncheck()",".uncheck()",".UncheckAsync()"],
  selectOption:[".selectOption('')",'.select_option("")','.selectOption("")','.SelectOptionAsync("")'],
  hover:[".hover()",".hover()",".hover()",".HoverAsync()"],
  press:[".press('Enter')",'.press("Enter")','.press("Enter")','.PressAsync("Enter")'],
  waitFor:[".waitFor()",".wait_for()",".waitFor()",".WaitForAsync()"],
  dblclick:[".dblclick()",".dblclick()",".dblclick()",".DblClickAsync()"],
};
function applyAction(code:string,action:string,lang:PwLang):string{if(action==='none')return code;const row=ACTION_MAP[action];if(!row)return code;const isCS=lang.startsWith('csharp'),isPy=lang.startsWith('python'),isJav=lang==='java';const suffix=isCS?row[3]:isPy?row[1]:isJav?row[2]:row[0];return `${(!isJav&&lang!=='python_sync')?'await ':''}${code}${suffix}`;}
function matchBadge(count:number){if(count===1)return{text:'✓ 1 match',bg:'#dcfce7',color:'#166534'};if(count>1)return{text:`⚠ ${count} matches`,bg:'#fef3c7',color:'#92400e'};if(count===0)return{text:'✗ no match',bg:'#fee2e2',color:'#991b1b'};return{text:'? unknown',bg:'#f1f5f9',color:'#475569'};}
function getContextualActions(attrs:ElementAttributes|null):ActionOption[]{if(!attrs)return[NO_ACTION,{label:'.click()',value:'click',hint:'Clicks'},{label:'.hover()',value:'hover',hint:'Hovers'}];const tag=attrs.tagName.toLowerCase(),type=(attrs.type??'').toLowerCase(),role=(attrs.role??'').toLowerCase();if(type==='checkbox'||role==='checkbox')return[NO_ACTION,{label:'.check()',value:'check',hint:'Ensures checked'},{label:'.uncheck()',value:'uncheck',hint:'Ensures unchecked'},{label:'.click()',value:'click',hint:'Toggles'}];if(type==='radio')return[NO_ACTION,{label:'.check()',value:'check',hint:'Selects'},{label:'.click()',value:'click',hint:'Clicks'}];if(type==='submit'||type==='button'||type==='reset')return[NO_ACTION,{label:'.click()',value:'click',hint:'Clicks button'},{label:'.hover()',value:'hover',hint:'Hovers'}];if(tag==='select')return[NO_ACTION,{label:".selectOption('')",value:'selectOption',hint:'Selects option'},{label:'.click()',value:'click',hint:'Opens dropdown'}];if(tag==='input'||tag==='textarea')return[NO_ACTION,{label:".fill('')",value:'fill',hint:'Clears and types'},{label:'.clear()',value:'clear',hint:'Removes all text'},{label:'.click()',value:'click',hint:'Focuses'},{label:".press('Enter')",value:'press',hint:'Sends key'}];if(tag==='button'||role==='button')return[NO_ACTION,{label:'.click()',value:'click',hint:'Clicks'},{label:'.hover()',value:'hover',hint:'Hovers'}];if(tag==='a')return[NO_ACTION,{label:'.click()',value:'click',hint:'Navigates'},{label:'.hover()',value:'hover',hint:'Hovers'}];return[NO_ACTION,{label:'.click()',value:'click',hint:'Clicks'},{label:'.hover()',value:'hover',hint:'Hovers'},{label:'.waitFor()',value:'waitFor',hint:'Waits'}];}
function getDefaultAction(attrs:ElementAttributes):string{const tag=attrs.tagName.toLowerCase(),type=(attrs.type??'').toLowerCase();if(type==='checkbox'||type==='radio')return 'check';if(tag==='select')return 'selectOption';if(tag==='input'||tag==='textarea')return 'fill';if(tag==='button'||tag==='a')return 'click';return 'none';}

interface EvalCounts {
  placeholder?:number; altText?:number; title?:number; testId?:number;
  text?:number; label?:number;
  roleWithName?:number; roleWithoutName?:number; roleName?:string; roleKind?:string;
}
interface EvalResult { attrs?: ElementAttributes; counts?: EvalCounts; outerHtml?: string; error?: string; }

const EVAL_SCRIPT = `(function(){try{const el=$0;if(!el||el===document||el===document.documentElement)return null;const isVis=e=>{const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'};const sa=n=>el.getAttribute(n)||undefined;const trim=s=>s?s.trim().replace(/\\s+/g,' '):undefined;const visFrom=els=>[...els].filter(isVis);const ea=s=>s.replace(/"/g,'\\\\"');const tag=el.tagName.toLowerCase();const id=el.id||undefined,type=sa('type'),name=sa('name'),role=sa('role');const ariaLabel=sa('aria-label'),placeholder=sa('placeholder'),alt=sa('alt'),title=sa('title');const testId=sa('data-testid')||sa('data-test-id')||sa('data-test');const innerText=trim((el.innerText||'').slice(0,100));const className=typeof el.className==='string'?el.className:undefined;const href=el instanceof HTMLAnchorElement&&el.href?el.href:undefined;let ariaLabelledBy;const lbId=sa('aria-labelledby');if(lbId){ariaLabelledBy=lbId.split(' ').map(i=>(document.getElementById(i)||{}).textContent||'').filter(Boolean).join(' ')||undefined;}let labelText;if(id){const lb=document.querySelector('label[for="'+id+'"]');if(lb){const cl=lb.cloneNode(true);cl.querySelectorAll('input,select,textarea,button').forEach(c=>c.remove());labelText=trim(cl.textContent);}}if(!labelText){const plb=el.closest('label');if(plb){const cl=plb.cloneNode(true);cl.querySelectorAll('input,select,textarea,button').forEach(c=>c.remove());labelText=trim(cl.textContent);}}const attrs={tagName:tag,id,type,name,role,ariaLabel,ariaLabelledBy,placeholder,alt,title,innerText,testId,labelText,className,href};const counts={};if(placeholder)counts.placeholder=visFrom(document.querySelectorAll('[placeholder="'+ea(placeholder)+'"]')).length;if(alt)counts.altText=visFrom(document.querySelectorAll('[alt="'+ea(alt)+'"]')).length;if(title)counts.title=visFrom(document.querySelectorAll('[title="'+ea(title)+'"]')).length;if(testId)counts.testId=visFrom(document.querySelectorAll('[data-testid="'+ea(testId)+'"],[data-test="'+ea(testId)+'"]')).length;if(innerText){let c=0;visFrom(document.querySelectorAll('*')).forEach(e=>{if(trim((e.innerText||''))===innerText)c++;});counts.text=c;}if(labelText){const lbs=visFrom(document.querySelectorAll('label')).filter(l=>trim(l.textContent)===labelText);let c=0;lbs.forEach(l=>{const f=l.getAttribute('for');if(f){const i=document.getElementById(f);if(i&&isVis(i))c++;}visFrom(l.querySelectorAll('input,select,textarea')).forEach(()=>c++);});counts.label=c;}const RSELS={button:'button,[role=button],input[type=button],input[type=submit],input[type=reset]',link:'a,[role=link]',textbox:'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]),[role=textbox],textarea',combobox:'select,[role=combobox]',checkbox:'input[type=checkbox],[role=checkbox]',radio:'input[type=radio],[role=radio]',heading:'h1,h2,h3,h4,h5,h6,[role=heading]',img:'img,[role=img]'};let dr=role;if(!dr){if(tag==='button'||type==='submit'||type==='button'||type==='reset')dr='button';else if(tag==='a')dr='link';else if(tag==='select')dr='combobox';else if(type==='checkbox')dr='checkbox';else if(type==='radio')dr='radio';else if(tag==='img')dr='img';else if(['h1','h2','h3','h4','h5','h6'].includes(tag))dr='heading';else if(tag==='textarea'||(tag==='input'&&(!type||['text','email','password','search','url','tel','number'].includes(type))))dr='textbox';}if(dr&&RSELS[dr]){const n=ariaLabel||ariaLabelledBy||labelText||(tag!=='input'&&tag!=='select'?innerText:'')||'';const getAN=e=>(e.getAttribute('aria-label')||e.textContent||'').trim();const all=visFrom(document.querySelectorAll(RSELS[dr]));counts.roleWithoutName=all.length;counts.roleWithName=n?all.filter(e=>getAN(e).toLowerCase().includes(n.toLowerCase())).length:0;counts.roleName=n;counts.roleKind=dr;}return{attrs,counts,outerHtml:el.outerHTML.slice(0,300)};}catch(e){return{error:String(e)};}})()`;

function buildCandidatesFromEval(attrs:ElementAttributes,counts:EvalCounts):ScoredCandidate[]{
  return buildCandidateSteps(attrs).map(step=>{
    let uniqueCount=-1;
    switch(step.kind){
      case 'placeholder':uniqueCount=counts.placeholder??-1;break;
      case 'altText':uniqueCount=counts.altText??-1;break;
      case 'title':uniqueCount=counts.title??-1;break;
      case 'testId':uniqueCount=counts.testId??-1;break;
      case 'text':uniqueCount=counts.text??-1;break;
      case 'label':uniqueCount=counts.label??-1;break;
      case 'role':uniqueCount=(step.options?.name?.value?(counts.roleWithName??-1):(counts.roleWithoutName??-1));break;
    }
    return{step,uniqueCount,score:scoreCandidate(step,uniqueCount)};
  });
}

// ─── Components ─────────────────────────────────────────────────────────────
function CopyBtn({text}:{text:string}){const[d,sD]=useState(false);return<button onClick={async()=>{await navigator.clipboard.writeText(text);sD(true);setTimeout(()=>sD(false),1500);}} style={{fontSize:10,padding:'2px 7px',border:'none',borderRadius:3,cursor:'pointer',fontWeight:700,flexShrink:0,background:d?'#16a34a':'#1e293b',color:'#fff'}}>{d?'✓':'📋'}</button>;}
function AddBtn({code,action,lang,onAdd}:{code:string;action:string;lang:PwLang;onAdd:(s:string)=>void}){const[d,sD]=useState(false);const al=action==='none'?'':` ${ACTION_MAP[action]?.[0]??action}`;return<button onClick={()=>{onAdd(applyAction(code,action,lang));sD(true);setTimeout(()=>sD(false),1200);}} style={{fontSize:9,padding:'2px 6px',border:'none',borderRadius:3,cursor:'pointer',fontWeight:700,flexShrink:0,background:d?'#16a34a':'#dbeafe',color:d?'#fff':'#1e40af',whiteSpace:'nowrap'}}>{d?'✓':`+ Code${al}`}</button>;}
function LocatorRow({candidate,code,action,lang,onAdd}:{candidate:ScoredCandidate;code:string;action:string;lang:PwLang;onAdd:(s:string)=>void}){const color=STRATEGY_COLORS[candidate.step.kind]??'#6b7280';const label=STRATEGY_LABELS[candidate.step.kind]??candidate.step.kind;const badge=matchBadge(candidate.uniqueCount);const unique=candidate.uniqueCount===1;return<div style={{borderBottom:'1px solid #e2e8f0',padding:'7px 10px',background:unique?'#f0fdf4':'#fff',borderLeft:unique?'3px solid #16a34a':'3px solid #e2e8f0'}}><div style={{display:'flex',alignItems:'center',gap:4,marginBottom:4,flexWrap:'wrap'}}><span style={{fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:3,background:color+'18',color}}>{label}</span><span style={{fontSize:9,fontWeight:600,padding:'1px 5px',borderRadius:3,background:badge.bg,color:badge.color}}>{badge.text}</span><div style={{flex:1}}/><AddBtn code={code} action={action} lang={lang} onAdd={onAdd}/><CopyBtn text={code}/></div><code style={{fontFamily:'"Fira Code",Consolas,monospace',fontSize:10,color:'#1e40af',background:'#eff6ff',padding:'3px 6px',borderRadius:3,display:'block',whiteSpace:'pre-wrap',wordBreak:'break-all',lineHeight:1.5}}>{code}</code></div>;}
function NARow({label,reason}:{label:string;reason:string}){return<div style={{borderBottom:'1px solid #f1f5f9',padding:'5px 10px',display:'flex',alignItems:'flex-start',gap:6,background:'#fafafa',borderLeft:'3px solid #e2e8f0'}}><span style={{fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:3,background:'#f1f5f9',color:'#94a3b8',flexShrink:0}}>{label}</span><span style={{fontSize:9,color:'#cbd5e1',flexShrink:0,paddingTop:1}}>— N/A</span><span style={{fontSize:10,color:'#94a3b8',lineHeight:1.4}}>{reason}</span></div>;}
function SubTabBar<T extends string>({tabs,active,onSelect,accent}:{tabs:Array<{id:T;label:string}>;active:T;onSelect:(t:T)=>void;accent:string}){return<div style={{display:'flex',gap:4,padding:'6px 8px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0',flexWrap:'wrap'}}>{tabs.map(t=><button key={t.id} onClick={()=>onSelect(t.id)} style={{fontSize:10,fontWeight:600,padding:'3px 10px',border:'none',borderRadius:12,cursor:'pointer',background:active===t.id?accent:'#e2e8f0',color:active===t.id?'#fff':'#475569'}}>{t.label}</button>)}</div>;}
function CSSRow({variant,lang,action,onAdd}:{variant:CSSVariant;lang:PwLang;action:string;onAdd:(s:string)=>void}){const rel=RELIABILITY_COLORS[variant.reliability];const code=toLocatorCode(variant.selector,lang);return<div style={{borderBottom:'1px solid #f1f5f9',padding:'5px 10px',borderLeft:'3px solid #e2e8f0'}}><div style={{display:'flex',alignItems:'center',gap:4,marginBottom:3,flexWrap:'wrap'}}><span style={{fontSize:9,fontWeight:600,padding:'1px 5px',borderRadius:3,background:rel.bg,color:rel.text,flexShrink:0}}>{rel.label}</span><span style={{fontSize:9,color:'#64748b',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{variant.description}</span><AddBtn code={code} action={action} lang={lang} onAdd={onAdd}/><CopyBtn text={variant.selector}/></div><code style={{fontFamily:'Consolas,monospace',fontSize:10,color:'#7c3aed',background:'#fdf4ff',padding:'2px 5px',borderRadius:3,display:'block',whiteSpace:'pre-wrap',wordBreak:'break-all'}}>{code}</code></div>;}
function XPathRow({variant,lang,action,onAdd}:{variant:XPathVariant;lang:PwLang;action:string;onAdd:(s:string)=>void}){const rel=RELIABILITY_COLORS[variant.reliability];const code=toXPathLocatorCode(variant.xpath,lang);return<div style={{borderBottom:'1px solid #f1f5f9',padding:'5px 10px',borderLeft:'3px solid #f59e0b20'}}><div style={{display:'flex',alignItems:'center',gap:4,marginBottom:3,flexWrap:'wrap'}}><span style={{fontSize:9,fontWeight:600,padding:'1px 5px',borderRadius:3,background:rel.bg,color:rel.text,flexShrink:0}}>{rel.label}</span><span style={{fontSize:9,color:'#64748b',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{variant.description}</span><AddBtn code={code} action={action} lang={lang} onAdd={onAdd}/><CopyBtn text={variant.xpath}/></div><code style={{fontFamily:'Consolas,monospace',fontSize:10,color:'#92400e',background:'#fffbeb',padding:'2px 5px',borderRadius:3,display:'block',whiteSpace:'pre-wrap',wordBreak:'break-all'}}>{code}</code></div>;}

// ─── Main panel ─────────────────────────────────────────────────────────────
export function Panel() {
  const [mainTab,     setMainTab]     = useState<MainTab>('playwright');
  const [pwLang,      setPwLang]      = useState<PwLang>('typescript');
  const [evalResult,  setEvalResult]  = useState<EvalResult|null>(null);
  const [evalError,   setEvalError]   = useState<string|null>(null);
  const [loading,     setLoading]     = useState(false);
  const [actionMode,  setActionMode]  = useState('none');
  const [cssSubTab,   setCssSubTab]   = useState<CSSSubTab>('core');
  const [xpathSubTab, setXpathSubTab] = useState<XPathSubTab>('core');
  const [codeBuffer,  setCodeBuffer]  = useState<string[]>([]);
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyResult,setVerifyResult]= useState<{count:number;error?:string}|null>(null);
  const [allCopied,   setAllCopied]   = useState(false);
  const [canUndo,     setCanUndo]     = useState(false);
  const prevBuf = useRef<string[]>([]);

  const evaluate = useCallback(() => {
    setLoading(true);
    // @ts-expect-error DevTools API
    chrome.devtools.inspectedWindow.eval(EVAL_SCRIPT,(result:EvalResult|null,error:{description?:string}|undefined)=>{
      setLoading(false);
      if (error){setEvalError(error.description??'Eval error');setEvalResult(null);return;}
      if (!result){setEvalResult(null);setEvalError(null);return;}
      if (result.error){setEvalError(result.error);setEvalResult(null);return;}
      setEvalError(null); setEvalResult(result);
      if (result.attrs) setActionMode('none');  // always reset to No action on new element
    });
  },[]);

  useEffect(()=>{
    evaluate();
    // @ts-expect-error DevTools API
    chrome.devtools.panels.elements.onSelectionChanged.addListener(evaluate);
    // @ts-expect-error DevTools API
    return()=>chrome.devtools.panels.elements.onSelectionChanged.removeListener(evaluate);
  },[evaluate]);

  const saveUndo=(cur:string[])=>{prevBuf.current=[...cur];setCanUndo(true);};
  const appendToCode=useCallback((code:string)=>{setCodeBuffer(prev=>{saveUndo(prev);return[...prev,code];});},[]);
  const removeLine=useCallback((i:number)=>{setCodeBuffer(prev=>{saveUndo(prev);return prev.filter((_,j)=>j!==i);});},[]);
  const undoLast=useCallback(()=>{if(!canUndo)return;setCodeBuffer(prevBuf.current);setCanUndo(false);prevBuf.current=[];},[canUndo]);
  const clearCode=useCallback(()=>{saveUndo(codeBuffer);setCodeBuffer([]);},[codeBuffer]);
  const copyAll=useCallback(async()=>{if(!codeBuffer.length)return;await navigator.clipboard.writeText(codeBuffer.join('\n'));setAllCopied(true);setTimeout(()=>setAllCopied(false),2000);},[codeBuffer]);

  const handleVerify=useCallback(async()=>{
    if(!verifyInput.trim())return; setVerifyResult(null);
    const sel=verifyInput.trim(),isXP=sel.startsWith('//')||sel.startsWith('(//');
    const q=isXP?`(function(){try{const r=document.evaluate('count('+${JSON.stringify(sel)}+')',document,null,XPathResult.NUMBER_TYPE,null);return Math.round(r.numberValue);}catch(e){return -1;}})()`:`(function(){try{return document.querySelectorAll(${JSON.stringify(sel)}).length;}catch(e){return -1;}})()`;
    // @ts-expect-error DevTools API
    chrome.devtools.inspectedWindow.eval(q,(count:number)=>setVerifyResult({count:count??-1,error:count===-1?'Invalid selector':undefined}));
  },[verifyInput]);

  const attrs = evalResult?.attrs??null;
  const candidates = useMemo(()=>attrs&&evalResult?.counts?buildCandidatesFromEval(attrs,evalResult.counts):[],[attrs,evalResult?.counts]);
  const byKind = useMemo(()=>{const m=new Map<string,ScoredCandidate[]>();for(const c of candidates){if(!m.has(c.step.kind))m.set(c.step.kind,[]);m.get(c.step.kind)!.push(c);}return m;},[candidates]);

  const allCSSVariants  = attrs ? generateAllCSSVariants(attrs) : [];
  const allXPathVariants = attrs ? generateAllXPathVariants(attrs) : [];
  const cssFiltered     = allCSSVariants.filter(v=>v.subTab===cssSubTab);
  const xpathFiltered   = allXPathVariants.filter(v=>v.subTab===xpathSubTab);
  const cssResult       = attrs ? generateCSS(attrs)    : null;
  const xpathResult     = attrs ? generateXPath(attrs)  : null;

  const availableActions = getContextualActions(attrs);
  const actionIsValid    = availableActions.some(a=>a.value===actionMode);
  const effectiveAction  = actionIsValid?actionMode:'none';
  const actionDef        = availableActions.find(a=>a.value===actionMode)??NO_ACTION;
  const genCode=(c:ScoredCandidate)=>{try{return generateLocatorCode({steps:[c.step]},pwLang);}catch{return '// error';}};
  const verifyColor=verifyResult?(verifyResult.error?'#dc2626':verifyResult.count===1?'#16a34a':verifyResult.count===0?'#dc2626':'#d97706'):'';

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',fontFamily:'system-ui,-apple-system,sans-serif',fontSize:13,color:'#1e293b',background:'#f8fafc',overflow:'hidden'}}>

      <div style={{background:'#1e293b',color:'#fff',padding:'8px 12px',display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
        {/* Refresh/Inspect button — left side, like Chrome DevTools */}
        <button onClick={evaluate} title="Re-evaluate selected element"
          style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',border:'none',borderRadius:6,cursor:'pointer',fontSize:11,fontWeight:700,background:'#dc2626',color:'#fff',transition:'background .2s',flexShrink:0}}>
          <span style={{fontSize:14,lineHeight:1,fontWeight:900}}>{loading?'⟳':'↖'}</span>
          {loading?'…':'Inspect'}
        </button>
        <span style={{fontWeight:800,fontSize:13,flex:1,letterSpacing:'-0.3px',textAlign:'center'}}>⚡ Playwright Guru</span>
        <select value={pwLang} onChange={e=>setPwLang(e.target.value as PwLang)}
          style={{fontSize:10,background:'#374151',color:'#fff',border:'none',borderRadius:4,padding:'3px 5px',cursor:'pointer'}}>
          {LANGS.map(l=><option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </div>

      <div style={{padding:'4px 12px',fontSize:10,fontWeight:500,textAlign:'center',flexShrink:0,background:'#f0f9ff',color:'#0369a1',borderBottom:'1px solid #bae6fd'}}>
        {loading?'⟳ Evaluating selected element…':attrs?`✓ Selected: <${attrs.tagName}${attrs.type?`[${attrs.type}]`:''}> ${attrs.id?`#${attrs.id}`:attrs.placeholder?`[placeholder]`:''}`:evalError?`⚠ ${evalError}`:'← Select an element in the DevTools Elements panel to inspect it'}
      </div>

      <div style={{display:'flex',background:'#fff',borderBottom:'2px solid #e2e8f0',flexShrink:0}}>
        {([['playwright','⭐ Playwright','#16a34a'],['css','{ } CSS','#2563eb'],['xpath','≡ XPath','#d97706']]as const).map(([tab,label,accent])=>(
          <button key={tab} onClick={()=>setMainTab(tab)} style={{flex:1,padding:'7px 4px',border:'none',cursor:'pointer',fontSize:10,fontWeight:700,background:mainTab===tab?'#fff':'#f8fafc',color:mainTab===tab?accent:'#64748b',borderBottom:mainTab===tab?`2px solid ${accent}`:'2px solid transparent',marginBottom:-2}}>
            {label}
          </button>
        ))}
      </div>

      {attrs && (
        <div style={{padding:'6px 10px',background:'#fff',borderBottom:'1px solid #e2e8f0',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:actionDef.hint?3:0}}>
            <code style={{fontSize:9,background:'#f1f5f9',color:'#475569',padding:'2px 5px',borderRadius:3,fontFamily:'Consolas,monospace',flexShrink:0}}>&lt;{attrs.tagName}{attrs.type?`[${attrs.type}]`:''}&gt;</code>
            <span style={{fontSize:10,color:'#64748b',flexShrink:0}}>Action:</span>
            <select value={actionIsValid?actionMode:'none'} onChange={e=>setActionMode(e.target.value)}
              style={{fontSize:10,padding:'3px 5px',border:'1px solid #e2e8f0',borderRadius:4,background:actionMode==='none'?'#f8fafc':'#eff6ff',color:'#1e293b',cursor:'pointer',flex:1}}>
              {availableActions.map(a=><option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
          {actionDef.hint&&<div style={{fontSize:10,color:'#2563eb',paddingLeft:2,display:'flex',gap:4}}><span style={{color:'#94a3b8',flexShrink:0}}>ℹ</span><span>{actionDef.hint}</span></div>}
        </div>
      )}

      <div style={{overflowY:'auto',flexShrink:0}}>
        {!attrs&&!loading&&(
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:32,gap:10,color:'#94a3b8',textAlign:'center',minHeight:200}}>
            <div style={{fontSize:40}}>🔍</div>
            <div style={{fontWeight:700,fontSize:14,color:'#64748b'}}>No element selected</div>
            <div style={{fontSize:11,maxWidth:220,lineHeight:1.5}}>Open DevTools (F12), go to <strong>Elements</strong> tab, click any element. This panel auto-updates.</div>
          </div>
        )}

        {attrs && (
          <>
            {/* ── ELEMENT HTML — pinned above locator cards ── */}
            {evalResult?.outerHtml&&(
              <details open style={{margin:'8px 8px 4px',border:'1px solid #e2e8f0',borderRadius:8,overflow:'hidden'}}>
                <summary style={{padding:'6px 10px',fontSize:10,fontWeight:700,color:'#64748b',cursor:'pointer',listStyle:'none',textTransform:'uppercase',letterSpacing:'.05em',display:'flex',justifyContent:'space-between',userSelect:'none',background:'#f8fafc'}}>
                  <span>Element HTML</span><span style={{fontWeight:400,fontSize:9}}>click to collapse</span>
                </summary>
                <code style={{display:'block',fontFamily:'Consolas,monospace',fontSize:10,color:'#475569',background:'#f1f5f9',padding:'6px 10px',whiteSpace:'pre-wrap',wordBreak:'break-all',lineHeight:1.5}}>{evalResult.outerHtml}</code>
              </details>
            )}

            {/* ── VERIFY SELECTOR — pinned above locator cards ── */}
            <div style={{padding:'8px 10px',margin:'0 8px 6px',border:'2px solid #7c3aed',borderRadius:8,background:'#f5f3ff',boxShadow:'0 2px 8px rgba(124,58,237,0.18)'}}>
              <div style={{fontSize:10,fontWeight:700,color:'#5b21b6',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:5}}>Verify Selector</div>
              <div style={{display:'flex',gap:5}}>
                <input value={verifyInput} onChange={e=>{setVerifyInput(e.target.value);setVerifyResult(null);}} onKeyDown={e=>e.key==='Enter'&&void handleVerify()}
                  placeholder="Type CSS or XPath then press Enter…" style={{flex:1,padding:'4px 7px',fontSize:10,border:'1.5px solid #a78bfa',borderRadius:4,fontFamily:'Consolas,monospace',background:'#fff',color:'#1e1b4b'}}/>
                <button onClick={()=>void handleVerify()} style={{padding:'4px 9px',borderRadius:4,border:'none',cursor:'pointer',fontSize:10,fontWeight:700,background:'#7c3aed',color:'#fff'}}>▶</button>
              </div>
              {verifyResult&&<div style={{marginTop:5,fontSize:10,fontWeight:600,color:verifyColor}}>{verifyResult.error?`Error: ${verifyResult.error}`:verifyResult.count===1?'✓ 1 element matched — unique!':verifyResult.count===0?'✗ No elements matched':`⚠ ${verifyResult.count} elements matched`}</div>}
            </div>

            {mainTab==='playwright'&&(
              <div style={{margin:'8px',border:'1px solid #e2e8f0',borderRadius:8,overflow:'hidden',background:'#fff'}}>
                <div style={{padding:'5px 10px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:9,fontWeight:700,color:'#475569'}}>⭐ ALL 7 PLAYWRIGHT LOCATOR TYPES</span>
                  <span style={{fontSize:9,color:'#16a34a',fontWeight:600}}>{Array.from(byKind.values()).flat().filter(c=>c.uniqueCount===1).length} unique</span>
                </div>
                <div style={{overflowY:'auto',maxHeight:196}}>
                  {ALL_GETBY_KINDS.map(({kind,label,naReason})=>{
                    const cands=(byKind.get(kind)??[]).filter(c=>c.uniqueCount!==0);
                    if(cands.length===0)return<NARow key={kind} label={label} reason={naReason}/>;
                    return cands.map((c,i)=><LocatorRow key={`${kind}-${i}-${pwLang}-${effectiveAction}`} candidate={c} code={genCode(c)} action={effectiveAction} lang={pwLang} onAdd={appendToCode}/>);
                  })}
                </div>
              </div>
            )}

            {mainTab==='css'&&(
              <div style={{margin:'8px',border:'1px solid #e2e8f0',borderRadius:8,overflow:'hidden',background:'#fff'}}>
                <div style={{padding:'5px 10px',background:'#eff6ff',borderBottom:'1px solid #bfdbfe',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:9,fontWeight:700,color:'#1e40af'}}>≡ page.locator() CSS VARIANTS</span>
                  <span style={{fontSize:9,color:'#94a3b8'}}>{cssFiltered.length} shown · {allCSSVariants.length} total</span>
                </div>
                {cssResult&&(
                  <div style={{padding:'8px 10px',background:'#f0f9ff',borderBottom:'1px solid #e2e8f0',display:'flex',alignItems:'center',gap:6}}>
                    <span style={{fontSize:9,fontWeight:700,color:'#64748b'}}>Best:</span>
                    <code style={{fontFamily:'Consolas,monospace',fontSize:11,color:'#0c4a6e',flex:1,background:'#e0f2fe',padding:'2px 6px',borderRadius:3}}>{cssResult.selector}</code>
                    <CopyBtn text={cssResult.selector}/>
                  </div>
                )}
                <SubTabBar tabs={CSS_SUB_TABS} active={cssSubTab} onSelect={setCssSubTab} accent="#2563eb"/>
                <div style={{overflowY:'auto',maxHeight:196}}>
                  {cssFiltered.length===0
                    ?<div style={{padding:'16px',fontSize:11,color:'#94a3b8',textAlign:'center'}}>No {cssSubTab} selectors for this element.</div>
                    :cssFiltered.map((v,i)=><CSSRow key={i} variant={v} lang={pwLang} action={effectiveAction} onAdd={appendToCode}/>)}
                </div>
              </div>
            )}

            {mainTab==='xpath'&&(
              <>
                <div style={{background:'#fef3c7',color:'#92400e',padding:'4px 12px',fontSize:10,fontWeight:600}}>⚠ Playwright recommends semantic locators over XPath.</div>
                <div style={{margin:'8px',border:'1px solid #fcd34d',borderRadius:8,overflow:'hidden',background:'#fff'}}>
                  <div style={{padding:'5px 10px',background:'#fffbeb',borderBottom:'1px solid #fcd34d',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:9,fontWeight:700,color:'#92400e'}}>⋔ page.locator() XPATH SYNTAXES</span>
                    <span style={{fontSize:9,color:'#94a3b8'}}>{xpathFiltered.length} shown · {allXPathVariants.length} total</span>
                  </div>
                  {xpathResult&&(
                    <div style={{padding:'8px 10px',background:'#fffbeb',borderBottom:'1px solid #fcd34d',display:'flex',alignItems:'center',gap:6}}>
                      <span style={{fontSize:9,fontWeight:700,color:'#64748b'}}>Best:</span>
                      <code style={{fontFamily:'Consolas,monospace',fontSize:11,color:'#78350f',flex:1,background:'#fef9c3',padding:'2px 6px',borderRadius:3}}>{xpathResult.xpath}</code>
                      <CopyBtn text={xpathResult.xpath}/>
                    </div>
                  )}
                  <SubTabBar tabs={XPATH_SUB_TABS} active={xpathSubTab} onSelect={setXpathSubTab} accent="#d97706"/>
                  <div style={{overflowY:'auto',maxHeight:196}}>
                    {xpathFiltered.length===0
                      ?<div style={{padding:'16px',fontSize:11,color:'#94a3b8',textAlign:'center'}}>No {xpathSubTab} XPath variants for this element.</div>
                      :xpathFiltered.map((v,i)=><XPathRow key={i} variant={v} lang={pwLang} action={effectiveAction} onAdd={appendToCode}/>)}
                  </div>
                </div>
              </>
            )}

          </>
        )}

      </div>
      <div style={{borderTop:'3px solid #f97316',background:'#1e1e1e',flex:1,minHeight:100}}>
          <div style={{padding:'6px 10px',display:'flex',alignItems:'center',gap:5,borderBottom:'1px solid #333',background:'#252526'}}>
            <span style={{fontSize:11,fontWeight:800,color:'#d4d4d4',flex:1}}>CODE</span>
            <span style={{fontSize:9,color:'#858585'}}>{codeBuffer.length} line{codeBuffer.length!==1?'s':''}</span>
            <button onClick={()=>void copyAll()} disabled={!codeBuffer.length} style={{fontSize:9,padding:'2px 8px',border:'none',borderRadius:3,cursor:codeBuffer.length?'pointer':'default',background:allCopied?'#16a34a':'#007acc',color:'#fff',fontWeight:700,opacity:codeBuffer.length?1:0.4}}>{allCopied?'✓ Copied!':'📋 Copy All'}</button>
            <button onClick={undoLast} disabled={!canUndo} style={{fontSize:9,padding:'2px 8px',border:'1px solid #555',borderRadius:3,cursor:canUndo?'pointer':'default',background:'transparent',color:canUndo?'#d4d4d4':'#555',fontWeight:700}}>↩ Undo</button>
            <button onClick={clearCode} disabled={!codeBuffer.length} style={{fontSize:9,padding:'2px 8px',border:'1px solid #c0392b',borderRadius:3,cursor:codeBuffer.length?'pointer':'default',background:'transparent',color:'#e87171',fontWeight:700,opacity:codeBuffer.length?1:0.4}}>Clear</button>
          </div>
          {codeBuffer.length===0
            ?<div style={{padding:'14px',fontSize:11,color:'#4a4a4a',fontFamily:'Consolas,monospace'}}><span style={{color:'#6a9955'}}>// Click </span><span style={{color:'#569cd6'}}>+ Code</span><span style={{color:'#6a9955'}}> on any locator above to build your script</span></div>
            :<div style={{maxHeight:200,overflowY:'auto',padding:'6px 0'}}>{codeBuffer.map((line,i)=><div key={i} style={{display:'flex',alignItems:'flex-start',padding:'1px 8px'}} onMouseEnter={e=>(e.currentTarget.style.background='#2a2d2e')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}><span style={{color:'#5a5a5a',userSelect:'none',flexShrink:0,width:22,textAlign:'right',paddingRight:10,fontSize:10,paddingTop:2,fontFamily:'Consolas,monospace'}}>{i+1}</span><span style={{flex:1,color:'#ce9178',wordBreak:'break-all',fontFamily:'"Fira Code",Consolas,monospace',fontSize:11,lineHeight:1.7}}>{line}</span><button onClick={()=>removeLine(i)} style={{fontSize:10,background:'transparent',border:'none',color:'#6b7280',cursor:'pointer',padding:'2px 4px',flexShrink:0}} onMouseEnter={e=>{e.currentTarget.style.color='#e87171';}} onMouseLeave={e=>{e.currentTarget.style.color='#6b7280';}}>✕</button></div>)}</div>
          }
      </div>
    </div>
  );
}
