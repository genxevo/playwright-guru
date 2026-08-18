import React, { useState, useEffect, useCallback, useRef } from 'react';
import { browser } from 'wxt/browser';
import { generateLocatorCode, type TargetLanguage } from '@playwright-guru/codegen';
import { buildCandidateSteps, type ScoredCandidate, type ElementAttributes } from '@playwright-guru/locator-engine';
import type { RecordedAction } from '../../utils/messaging';
import {
  generateCSS, generateXPath, generateAllCSSVariants, generateAllXPathVariants,
  toLocatorCode, toXPathLocatorCode,
  CSS_SUB_TABS, XPATH_SUB_TABS, RELIABILITY_COLORS,
  type CSSSubTab, type XPathSubTab, type CSSVariant, type XPathVariant,
} from '../../utils/css-xpath';
import type { RuntimeMessage, RuntimeMessageAck, StoredPick, VerifySelectorMessage } from '../../utils/messaging';

// ─── Types ─────────────────────────────────────────────────────────────────
type MainTab = 'playwright' | 'css' | 'xpath';
type PwLang  = TargetLanguage;
interface ActionOption { label: string; value: string; hint: string }

// ─── All 7 getBy* kinds ────────────────────────────────────────────────────
const ALL_GETBY_KINDS = [
  { kind: 'role'        as const, label: 'getByRole',        color: '#16a34a', naReason: 'No ARIA role detected — try semantic HTML like <button>, <a>, <select>.' },
  { kind: 'label'       as const, label: 'getByLabel',       color: '#16a34a', naReason: 'No <label> found — add <label for="..."> or wrap element in <label>.' },
  { kind: 'placeholder' as const, label: 'getByPlaceholder', color: '#2563eb', naReason: 'No placeholder attribute — only available on <input> and <textarea>.' },
  { kind: 'text'        as const, label: 'getByText',        color: '#2563eb', naReason: 'No visible text — for interactive elements prefer getByRole with a name.' },
  { kind: 'altText'     as const, label: 'getByAltText',     color: '#7c3aed', naReason: 'No alt attribute — only applies to <img> and <input type="image">.' },
  { kind: 'title'       as const, label: 'getByTitle',       color: '#6b7280', naReason: 'No title attribute. Note: title is poorly supported by assistive tech.' },
  { kind: 'testId'      as const, label: 'getByTestId',      color: '#d97706', naReason: 'No data-testid found. ★ Consider adding one — it\'s the most stable locator.' },
];
const STRATEGY_COLORS: Record<string, string> = { role:'#16a34a',label:'#16a34a',placeholder:'#2563eb',text:'#2563eb',altText:'#7c3aed',title:'#6b7280',testId:'#d97706' };
const STRATEGY_LABELS: Record<string, string> = { role:'getByRole',label:'getByLabel',placeholder:'getByPlaceholder',text:'getByText',altText:'getByAltText',title:'getByTitle',testId:'getByTestId' };

// ─── Constants ─────────────────────────────────────────────────────────────
const LANGS: Array<{ label: string; value: PwLang }> = [
  { label: 'TypeScript', value: 'typescript'   },
  { label: 'JavaScript', value: 'javascript'   },
  { label: 'Python',     value: 'python_sync'  },  // sync = cleaner code, no await confusion
  { label: 'Java',       value: 'java'         },
  { label: 'C#',         value: 'csharp_async' },  // Playwright .NET is always async
];
const NO_ACTION: ActionOption = { label: 'No action', value: 'none', hint: '' };
const ACTION_MAP: Record<string, [string, string, string, string]> = {
  click:        [".click()",          ".click()",          ".click()",          ".ClickAsync()"          ],
  fill:         [".fill('')",         '.fill("")',         '.fill("")',         '.FillAsync("")'         ],
  clear:        [".clear()",          ".clear()",          ".clear()",          ".ClearAsync()"          ],
  check:        [".check()",          ".check()",          ".check()",          ".CheckAsync()"          ],
  uncheck:      [".uncheck()",        ".uncheck()",        ".uncheck()",        ".UncheckAsync()"        ],
  selectOption: [".selectOption('')", '.select_option("")','.selectOption("")', '.SelectOptionAsync("")' ],
  hover:        [".hover()",          ".hover()",          ".hover()",          ".HoverAsync()"          ],
  press:        [".press('Enter')",   '.press("Enter")',   '.press("Enter")',   '.PressAsync("Enter")'   ],
  waitFor:      [".waitFor()",        ".wait_for()",       ".waitFor()",        ".WaitForAsync()"        ],
  dblclick:     [".dblclick()",       ".dblclick()",       ".dblclick()",       ".DblClickAsync()"       ],
};
function applyAction(code: string, action: string, lang: PwLang): string {
  if (action === 'none') return code;
  const row = ACTION_MAP[action]; if (!row) return code;
  const isCS=lang.startsWith('csharp'),isPy=lang.startsWith('python'),isJav=lang==='java';
  const suffix=isCS?row[3]:isPy?row[1]:isJav?row[2]:row[0];
  return `${(!isJav&&lang!=='python_sync')?'await ':''}${code}${suffix}`;
}
function matchBadge(count: number) {
  if (count===1) return {text:'✓ 1 match',bg:'#dcfce7',color:'#166534'};
  if (count>1)  return {text:`⚠ ${count} matches`,bg:'#fef3c7',color:'#92400e'};
  if (count===0) return {text:'✗ no match',bg:'#fee2e2',color:'#991b1b'};
  return {text:'? unknown',bg:'#f1f5f9',color:'#475569'};
}
function getContextualActions(attrs: ElementAttributes | null): ActionOption[] {
  if (!attrs) return [NO_ACTION,{label:'.click()',value:'click',hint:'Clicks the element'},{label:'.hover()',value:'hover',hint:'Hovers'}];
  const tag=attrs.tagName.toLowerCase(),type=(attrs.type??'').toLowerCase(),role=(attrs.role??'').toLowerCase();
  if (type==='checkbox'||role==='checkbox') return [NO_ACTION,{label:'.check()',value:'check',hint:'Ensures checked'},{label:'.uncheck()',value:'uncheck',hint:'Ensures unchecked'},{label:'.click()',value:'click',hint:'Toggles'}];
  if (type==='radio') return [NO_ACTION,{label:'.check()',value:'check',hint:'Selects this option'},{label:'.click()',value:'click',hint:'Clicks to select'}];
  if (type==='submit'||type==='button'||type==='reset') return [NO_ACTION,{label:'.click()',value:'click',hint:'Clicks the button'},{label:'.hover()',value:'hover',hint:'Hovers'},{label:'.dblclick()',value:'dblclick',hint:'Double-clicks'}];
  if (tag==='select') return [NO_ACTION,{label:".selectOption('')",value:'selectOption',hint:"Selects a dropdown option — replace '' with value"},{label:'.click()',value:'click',hint:'Opens dropdown'}];
  if (tag==='input'||tag==='textarea') return [NO_ACTION,{label:".fill('')",value:'fill',hint:"Clears and types new text"},{label:'.clear()',value:'clear',hint:'Removes all text'},{label:'.click()',value:'click',hint:'Focuses field'},{label:".press('Enter')",value:'press',hint:'Sends keyboard key'}];
  if (tag==='button'||role==='button') return [NO_ACTION,{label:'.click()',value:'click',hint:'Clicks'},{label:'.hover()',value:'hover',hint:'Hovers'},{label:'.dblclick()',value:'dblclick',hint:'Double-clicks'}];
  if (tag==='a') return [NO_ACTION,{label:'.click()',value:'click',hint:'Navigates'},{label:'.hover()',value:'hover',hint:'Hovers for menu triggers'}];
  return [NO_ACTION,{label:'.click()',value:'click',hint:'Clicks the element'},{label:'.hover()',value:'hover',hint:'Hovers'},{label:'.waitFor()',value:'waitFor',hint:'Waits until visible'}];
}
function getDefaultAction(attrs: ElementAttributes): string {
  const tag=attrs.tagName.toLowerCase(),type=(attrs.type??'').toLowerCase();
  if (type==='checkbox'||type==='radio') return 'check';
  if (tag==='select') return 'selectOption';
  if (tag==='input'||tag==='textarea') return 'fill';
  if (tag==='button'||tag==='a') return 'click';
  return 'none';
}


// ─── Recording helpers ──────────────────────────────────────────────────────

/** Pick the best available locator for an element from its attributes alone
 *  (no DOM uniqueness check — recording is captured without context). */
function attrsToLocatorCode(attrs: ElementAttributes, lang: PwLang): string {
  try {
    const steps = buildCandidateSteps(attrs);
    const priority = ['role','label','placeholder','text','altText','title','testId'];
    const best = [...steps].sort((a,b)=>priority.indexOf(a.kind)-priority.indexOf(b.kind))[0];
    if (!best) return `page.locator('${attrs.tagName}')`;
    return generateLocatorCode({ steps: [best] }, lang);
  } catch { return `page.locator('${attrs.tagName}')`; }
}


function actionToCodeLine(action: RecordedAction, lang: PwLang): string {
  const isJS = lang === 'typescript' || lang === 'javascript';
  const isPy = lang === 'python_sync';
  const isCS = lang === 'csharp_async';
  const aw  = isJS || isCS ? 'await ' : '';
  const ea  = (s: string) => s.replace(/"/g, '\\"');
  const eq  = (s: string) => s.replace(/'/g, "\\'");
  const val = action.value ?? '';

  if (action.kind === 'goto') {
    const url = action.url ?? '';
    if (isJS)   return `${aw}page.goto('${eq(url)}');`;
    if (isPy)   return `page.goto("${ea(url)}")`;
    if (lang === 'java') return `page.navigate("${ea(url)}");`;
    if (isCS)   return `${aw}Page.GotoAsync("${ea(url)}");`;
    return `page.goto('${url}');`;
  }
  if (!action.attrs) return '';
  const loc = attrsToLocatorCode(action.attrs, lang);
  switch (action.kind) {
    case 'click':
      if (isJS)   return `${aw}${loc}.click();`;
      if (isPy)   return `${loc}.click()`;
      if (lang === 'java') return `${loc}.click();`;
      if (isCS)   return `${aw}${loc}.ClickAsync();`;
      break;
    case 'dblclick':
      if (isJS)   return `${aw}${loc}.dblclick();`;
      if (isPy)   return `${loc}.dblclick()`;
      if (lang === 'java') return `${loc}.dblclick();`;
      if (isCS)   return `${aw}${loc}.DblClickAsync();`;
      break;
    case 'fill':
      if (isJS)   return `${aw}${loc}.fill('${eq(val)}');`;
      if (isPy)   return `${loc}.fill("${ea(val)}")`;
      if (lang === 'java') return `${loc}.fill("${ea(val)}");`;
      if (isCS)   return `${aw}${loc}.FillAsync("${ea(val)}");`;
      break;
    case 'check':
      if (isJS)   return `${aw}${loc}.check();`;
      if (isPy)   return `${loc}.check()`;
      if (lang === 'java') return `${loc}.check();`;
      if (isCS)   return `${aw}${loc}.CheckAsync();`;
      break;
    case 'uncheck':
      if (isJS)   return `${aw}${loc}.uncheck();`;
      if (isPy)   return `${loc}.uncheck()`;
      if (lang === 'java') return `${loc}.uncheck();`;
      if (isCS)   return `${aw}${loc}.UncheckAsync();`;
      break;
    case 'selectOption':
      if (isJS)   return `${aw}${loc}.selectOption('${eq(val)}');`;
      if (isPy)   return `${loc}.select_option("${ea(val)}")`;
      if (lang === 'java') return `${loc}.selectOption("${ea(val)}");`;
      if (isCS)   return `${aw}${loc}.SelectOptionAsync("${ea(val)}");`;
      break;
  }
  return '';
}

function generateTestCode(actions: RecordedAction[], lang: PwLang): string {
  if (!actions.length) return '';
  const isJS = lang === 'typescript' || lang === 'javascript';
  const isPy = lang === 'python_sync';
  const isJava = lang === 'java';
  const isCS = lang === 'csharp_async';
  const aw = isJS || isCS ? 'await ' : '';
  const ind = '  ';
  const ea = (s: string) => s.replace(/"/g, '\\"');
  const eq = (s: string) => s.replace(/'/g, "\\'");
  const lines: string[] = [];

  if (isJS) { lines.push(`import { test, expect } from '@playwright/test';`, '', `test('recorded test', async ({ page }) => {`); }
  else if (isPy)   { lines.push(`def test_recorded(page):`); }
  else if (isJava) { lines.push(`@Test`, `public void recordedTest() {`); }
  else if (isCS)   { lines.push(`[Test]`, `public async Task RecordedTestAsync() {`); }

  for (const action of actions) {
    let line = '';
    const val = action.value ?? '';
    if (action.kind === 'goto') {
      const url = action.url ?? '';
      if (isJS)   line = `${aw}page.goto('${eq(url)}');`;
      if (isPy)   line = `page.goto("${ea(url)}")`;
      if (isJava) line = `page.navigate("${ea(url)}");`;
      if (isCS)   line = `${aw}Page.GotoAsync("${ea(url)}");`;
    } else if (action.attrs) {
      const loc = attrsToLocatorCode(action.attrs, lang);
      switch (action.kind) {
        case 'click':
          if (isJS)   line = `${aw}${loc}.click();`;
          if (isPy)   line = `${loc}.click()`;
          if (isJava) line = `${loc}.click();`;
          if (isCS)   line = `${aw}${loc}.ClickAsync();`; break;
        case 'dblclick':
          if (isJS)   line = `${aw}${loc}.dblclick();`;
          if (isPy)   line = `${loc}.dblclick()`;
          if (isJava) line = `${loc}.dblclick();`;
          if (isCS)   line = `${aw}${loc}.DblClickAsync();`; break;
        case 'fill':
          if (isJS)   line = `${aw}${loc}.fill('${eq(val)}');`;
          if (isPy)   line = `${loc}.fill("${ea(val)}")`;
          if (isJava) line = `${loc}.fill("${ea(val)}");`;
          if (isCS)   line = `${aw}${loc}.FillAsync("${ea(val)}");`; break;
        case 'check':
          if (isJS)   line = `${aw}${loc}.check();`;
          if (isPy)   line = `${loc}.check()`;
          if (isJava) line = `${loc}.check();`;
          if (isCS)   line = `${aw}${loc}.CheckAsync();`; break;
        case 'uncheck':
          if (isJS)   line = `${aw}${loc}.uncheck();`;
          if (isPy)   line = `${loc}.uncheck()`;
          if (isJava) line = `${loc}.uncheck();`;
          if (isCS)   line = `${aw}${loc}.UncheckAsync();`; break;
        case 'selectOption':
          if (isJS)   line = `${aw}${loc}.selectOption('${eq(val)}');`;
          if (isPy)   line = `${loc}.select_option("${ea(val)}")`;
          if (isJava) line = `${loc}.selectOption("${ea(val)}");`;
          if (isCS)   line = `${aw}${loc}.SelectOptionAsync("${ea(val)}");`; break;
      }
    }
    if (line) lines.push(`${ind}${line}`);
  }

  if (isJS) lines.push('});');
  else if (isJava || isCS) lines.push('}');
  return lines.join('\n');
}

// ─── Small components ───────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return <button onClick={async()=>{await navigator.clipboard.writeText(text);setDone(true);setTimeout(()=>setDone(false),1500);}}
    style={{fontSize:10,padding:'2px 7px',border:'none',borderRadius:3,cursor:'pointer',fontWeight:700,flexShrink:0,background:done?'#16a34a':'#1e293b',color:'#fff',transition:'background .2s'}}>
    {done?'✓':'📋'}
  </button>;
}
function AddBtn({ code, action, lang, onAdd }: { code: string; action: string; lang: PwLang; onAdd: (s: string) => void }) {
  const [done, setDone] = useState(false);
  const al=action==='none'?'':` ${ACTION_MAP[action]?.[0]??action}`;
  return <button onClick={()=>{onAdd(applyAction(code,action,lang));setDone(true);setTimeout(()=>setDone(false),1200);}}
    style={{fontSize:9,padding:'2px 6px',border:'none',borderRadius:3,cursor:'pointer',fontWeight:700,flexShrink:0,background:done?'#16a34a':'#dbeafe',color:done?'#fff':'#1e40af',transition:'background .2s',whiteSpace:'nowrap'}}>
    {done?'✓':`+ Code${al}`}
  </button>;
}
function LocatorRow({ candidate, code, action, lang, onAdd }: { candidate: ScoredCandidate; code: string; action: string; lang: PwLang; onAdd: (s: string) => void }) {
  const color=STRATEGY_COLORS[candidate.step.kind]??'#6b7280';
  const label=STRATEGY_LABELS[candidate.step.kind]??candidate.step.kind;
  const badge=matchBadge(candidate.uniqueCount);
  const unique=candidate.uniqueCount===1;
  return <div style={{borderBottom:'1px solid #e2e8f0',padding:'7px 10px',background:unique?'#f0fdf4':'#fff',borderLeft:unique?'3px solid #16a34a':'3px solid #e2e8f0'}}>
    <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:4,flexWrap:'wrap'}}>
      <span style={{fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:3,background:color+'18',color}}>{label}</span>
      <span style={{fontSize:9,fontWeight:600,padding:'1px 5px',borderRadius:3,background:badge.bg,color:badge.color}}>{badge.text}</span>
      <div style={{flex:1}}/>
      <AddBtn code={code} action={action} lang={lang} onAdd={onAdd}/>
      <CopyBtn text={code}/>
    </div>
    <code style={{fontFamily:'"Fira Code",Consolas,monospace',fontSize:10,color:'#1e40af',background:'#eff6ff',padding:'3px 6px',borderRadius:3,display:'block',whiteSpace:'pre-wrap',wordBreak:'break-all',lineHeight:1.5}}>{code}</code>
  </div>;
}
function NARow({ label, reason }: { label: string; reason: string }) {
  return <div style={{borderBottom:'1px solid #f1f5f9',padding:'5px 10px',display:'flex',alignItems:'flex-start',gap:6,background:'#fafafa',borderLeft:'3px solid #e2e8f0'}}>
    <span style={{fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:3,background:'#f1f5f9',color:'#94a3b8',flexShrink:0}}>{label}</span>
    <span style={{fontSize:9,color:'#cbd5e1',flexShrink:0,paddingTop:1}}>— N/A</span>
    <span style={{fontSize:10,color:'#94a3b8',lineHeight:1.4}}>{reason}</span>
  </div>;
}

// Sub-tab pill bar component
function SubTabBar<T extends string>({ tabs, active, onSelect, accent }: { tabs: Array<{id:T;label:string}>; active: T; onSelect: (t:T)=>void; accent: string }) {
  return <div style={{display:'flex',gap:4,padding:'6px 8px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0',flexWrap:'wrap'}}>
    {tabs.map(t=>(
      <button key={t.id} onClick={()=>onSelect(t.id)} style={{
        fontSize:10,fontWeight:600,padding:'3px 10px',border:'none',borderRadius:12,cursor:'pointer',
        background:active===t.id?accent:'#e2e8f0',
        color:active===t.id?'#fff':'#475569',transition:'background .15s',
      }}>{t.label}</button>
    ))}
  </div>;
}

// CSS variant row
function CSSRow({ variant, lang, action, onAdd }: { variant: CSSVariant & { code?: string }; lang: PwLang; action: string; onAdd: (s:string)=>void }) {
  const rel=RELIABILITY_COLORS[variant.reliability];
  const code=variant.code??toLocatorCode(variant.selector,lang);
  return <div style={{borderBottom:'1px solid #f1f5f9',padding:'5px 10px',borderLeft:'3px solid #e2e8f0'}}>
    <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:3,flexWrap:'wrap'}}>
      <span style={{fontSize:9,fontWeight:600,padding:'1px 5px',borderRadius:3,background:rel.bg,color:rel.text,flexShrink:0}}>{rel.label}</span>
      <span style={{fontSize:9,color:'#64748b',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{variant.description}</span>
      <AddBtn code={code} action={action} lang={lang} onAdd={onAdd}/>
      <CopyBtn text={variant.selector}/>
    </div>
    <code style={{fontFamily:'Consolas,monospace',fontSize:10,color:'#7c3aed',background:'#fdf4ff',padding:'2px 5px',borderRadius:3,display:'block',whiteSpace:'pre-wrap',wordBreak:'break-all'}}>{code}</code>
  </div>;
}

// XPath variant row
function XPathRow({ variant, lang, action, onAdd }: { variant: XPathVariant; lang: PwLang; action: string; onAdd: (s:string)=>void }) {
  const rel=RELIABILITY_COLORS[variant.reliability];
  const code=toXPathLocatorCode(variant.xpath,lang);
  return <div style={{borderBottom:'1px solid #f1f5f9',padding:'5px 10px',borderLeft:'3px solid #f59e0b20'}}>
    <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:3,flexWrap:'wrap'}}>
      <span style={{fontSize:9,fontWeight:600,padding:'1px 5px',borderRadius:3,background:rel.bg,color:rel.text,flexShrink:0}}>{rel.label}</span>
      <span style={{fontSize:9,color:'#64748b',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{variant.description}</span>
      <AddBtn code={code} action={action} lang={lang} onAdd={onAdd}/>
      <CopyBtn text={variant.xpath}/>
    </div>
    <code style={{fontFamily:'Consolas,monospace',fontSize:10,color:'#92400e',background:'#fffbeb',padding:'2px 5px',borderRadius:3,display:'block',whiteSpace:'pre-wrap',wordBreak:'break-all'}}>{code}</code>
  </div>;
}

// ─── Main panel ─────────────────────────────────────────────────────────────
export function SidePanel() {
  const [pickerActive, setPickerActive] = useState(false);
  const [mainTab,      setMainTab]      = useState<MainTab>('playwright');
  const [pwLang,       setPwLang]       = useState<PwLang>('typescript');
  const [pick,         setPick]         = useState<StoredPick | null>(null);
  const [codeBuffer,   setCodeBuffer]   = useState<string[]>([]);
  const [actionMode,   setActionMode]   = useState('none');
  const [cssSubTab,    setCssSubTab]    = useState<CSSSubTab>('core');
  const [xpathSubTab,  setXpathSubTab]  = useState<XPathSubTab>('core');
  const [verifyInput,  setVerifyInput]  = useState('');
  const [verifyResult, setVerifyResult] = useState<{count:number;error?:string}|null>(null);
  const [verifying,    setVerifying]    = useState(false);
  const [statusMsg,    setStatusMsg]    = useState('');
  const [statusOk,     setStatusOk]     = useState(true);
  const [allCopied,    setAllCopied]    = useState(false);
  const [canUndo,      setCanUndo]      = useState(false);
  const prevBufferRef = useRef<string[]>([]);

  const pwLangRef = useRef<PwLang>('typescript');

  // Recording state
  const [recording,       setRecording]       = useState(false);
  const [recordedActions, setRecordedActions] = useState<RecordedAction[]>([]);
  const [recCopied,       setRecCopied]       = useState(false);

  const getActiveTabId = useCallback(async (): Promise<number | undefined> => {
    try { return (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.id; } catch { return undefined; }
  }, []);

  useEffect(() => {
    pwLangRef.current = pwLang;  // keep ref in sync for listener closures
    void browser.storage.local.get(['pg_picker_active','pg_last_pick','pg_pw_lang','pg_code_buffer']).then(r => {
      setPickerActive(Boolean(r['pg_picker_active']));
      const p = r['pg_last_pick'] as StoredPick | undefined;
      if (p) { setPick(p); setActionMode('none'); }
      const lang = r['pg_pw_lang'] as PwLang | undefined;
      if (lang) setPwLang(lang);
      const buf = r['pg_code_buffer'] as string[] | undefined;
      if (buf) setCodeBuffer(buf);
      setRecording(Boolean(r['pg_recording_active']));
      const ra = r['pg_recorded_actions'] as RecordedAction[] | undefined;
      if (ra) setRecordedActions(ra);
    });
    const handler = (changes: Record<string, {newValue?: unknown}>) => {
      if ('pg_picker_active' in changes) setPickerActive(Boolean(changes['pg_picker_active']?.newValue));
      if ('pg_last_pick' in changes) {
        const p = changes['pg_last_pick']?.newValue as StoredPick | undefined;
        if (p) { setPick(p); setActionMode('none'); }
      }
      if ('pg_recording_active' in changes) setRecording(Boolean(changes['pg_recording_active']?.newValue));
      if ('pg_recorded_actions' in changes) {
        const ra = changes['pg_recorded_actions']?.newValue as RecordedAction[] | undefined;
        if (ra) {
          // Auto-append each NEW action to the CODE buffer as it's recorded
          setRecordedActions(prev => {
            if (ra.length > prev.length) {
              const freshActions = ra.slice(prev.length);
              setCodeBuffer(buf => {
                const newLines = freshActions
                  .map(a => actionToCodeLine(a, pwLangRef.current))
                  .filter(Boolean);
                if (!newLines.length) return buf;
                const next = [...buf, ...newLines];
                void browser.storage.local.set({ pg_code_buffer: next });
                return next;
              });
            }
            return ra;
          });
        }
      }
    };
    browser.storage.onChanged.addListener(handler);
    return () => browser.storage.onChanged.removeListener(handler);
  }, []);

  const togglePicker = useCallback(async () => {
    const next = !pickerActive;
    const targetTabId = await getActiveTabId();
    const msg: RuntimeMessage = next ? { type:'ACTIVATE_PICKER', targetTabId } : { type:'DEACTIVATE_PICKER', targetTabId };
    setStatusMsg(next?'Activating…':'Stopping…'); setStatusOk(true);
    try {
      const ack = (await browser.runtime.sendMessage(msg)) as RuntimeMessageAck | undefined;
      if (ack?.ok === false) { setStatusOk(false); setStatusMsg(ack.error??'Error'); setTimeout(()=>{setStatusMsg('');setStatusOk(true);},5000); }
      else { setPickerActive(next); setStatusMsg(next?'↗ Click any element on the page':''); if(!next) setTimeout(()=>setStatusMsg(''),2000); }
    } catch { setStatusOk(false); setStatusMsg('Refresh the page first.'); setTimeout(()=>{setStatusMsg('');setStatusOk(true);},5000); }
  }, [pickerActive, getActiveTabId]);

  const toggleRecording = useCallback(async () => {
    const next = !recording;
    const targetTabId = await getActiveTabId();
    const msg: RuntimeMessage = next
      ? { type: 'START_RECORDING', targetTabId }
      : { type: 'STOP_RECORDING',  targetTabId };
    try {
      const ack = (await browser.runtime.sendMessage(msg)) as RuntimeMessageAck | undefined;
      if (ack?.ok !== false) {
        setRecording(next);
        if (next) { setRecordedActions([]); }  // clear on new recording start
      } else {
        console.warn('Recording toggle failed:', ack.error);
      }
    } catch (e) { console.warn('Recording error:', e); }
  }, [recording, getActiveTabId]);

  const copyTestCode = useCallback(async () => {
    if (!recordedActions.length) return;
    await navigator.clipboard.writeText(generateTestCode(recordedActions, pwLang));
    setRecCopied(true); setTimeout(() => setRecCopied(false), 2000);
  }, [recordedActions, pwLang]);

  const clearRecording = useCallback(() => {
    setRecordedActions([]);
    void browser.storage.local.set({ pg_recorded_actions: [] });
  }, []);

  const saveUndo = useCallback((cur: string[]) => { prevBufferRef.current=[...cur]; setCanUndo(true); }, []);
  const appendToCode = useCallback((code: string) => { setCodeBuffer(prev=>{saveUndo(prev);const n=[...prev,code];void browser.storage.local.set({pg_code_buffer:n});return n;}); }, [saveUndo]);
  const removeLine = useCallback((i: number) => { setCodeBuffer(prev=>{saveUndo(prev);const n=prev.filter((_,j)=>j!==i);void browser.storage.local.set({pg_code_buffer:n});return n;}); }, [saveUndo]);
  const undoLast = useCallback(() => { if(!canUndo) return; setCodeBuffer(prevBufferRef.current); void browser.storage.local.set({pg_code_buffer:prevBufferRef.current}); setCanUndo(false); prevBufferRef.current=[]; }, [canUndo]);
  const clearCode = useCallback(() => { saveUndo(codeBuffer); setCodeBuffer([]); void browser.storage.local.set({pg_code_buffer:[]}); }, [codeBuffer, saveUndo]);
  const copyAll = useCallback(async () => { if(!codeBuffer.length) return; await navigator.clipboard.writeText(codeBuffer.join('\n')); setAllCopied(true); setTimeout(()=>setAllCopied(false),2000); }, [codeBuffer]);

  const handleVerify = useCallback(async () => {
    if(!verifyInput.trim()) return; setVerifying(true); setVerifyResult(null);
    const targetTabId = await getActiveTabId();
    if(!targetTabId) { setVerifying(false); setVerifyResult({count:-1,error:'No active tab'}); return; }
    const selectorType: VerifySelectorMessage['selectorType'] = verifyInput.trim().startsWith('//')||verifyInput.trim().startsWith('(//')?'xpath':'css';
    try {
      const ack=(await browser.runtime.sendMessage({type:'VERIFY_SELECTOR',selector:verifyInput.trim(),selectorType,targetTabId}as VerifySelectorMessage)) as RuntimeMessageAck|undefined;
      setVerifyResult(ack?.ok?{count:ack.count??0}:{count:-1,error:ack?.error});
    } catch(e){ setVerifyResult({count:-1,error:String(e)}); }
    setVerifying(false);
  }, [verifyInput, getActiveTabId]);

  // ── Derived state ──────────────────────────────────────────────────────
  const byKind = new Map<string, ScoredCandidate[]>();
  for (const c of pick?.candidates??[]) { if(!byKind.has(c.step.kind)) byKind.set(c.step.kind,[]); byKind.get(c.step.kind)!.push(c); }

  const availableActions = getContextualActions(pick?.attributes??null);
  const actionIsValid    = availableActions.some(a=>a.value===actionMode);
  const effectiveAction  = actionIsValid?actionMode:'none';
  const actionDef        = availableActions.find(a=>a.value===actionMode)??NO_ACTION;

  const allCSSVariants  = pick ? generateAllCSSVariants(pick.attributes) : [];
  const allXPathVariants = pick ? generateAllXPathVariants(pick.attributes) : [];
  const cssFiltered     = allCSSVariants.filter(v=>v.subTab===cssSubTab);
  const xpathFiltered   = allXPathVariants.filter(v=>v.subTab===xpathSubTab);
  const cssResult       = pick ? generateCSS(pick.attributes) : null;
  const xpathResult     = pick ? generateXPath(pick.attributes) : null;

  const genCode = (c: ScoredCandidate) => { try { return generateLocatorCode({steps:[c.step]},pwLang); } catch { return '// error'; } };
  const verifyColor = verifyResult ? (verifyResult.error?'#dc2626':verifyResult.count===1?'#16a34a':verifyResult.count===0?'#dc2626':'#d97706') : '';

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',fontFamily:'system-ui,-apple-system,sans-serif',fontSize:13,color:'#1e293b',background:'#f8fafc',overflow:'hidden'}}>

      {/* 1. Global Header */}
      <div style={{background:'#1e293b',color:'#fff',padding:'8px 12px',display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
        {/* Inspect button */}
        <button onClick={togglePicker} title={pickerActive?'Stop picking':'Inspect element on page'}
          disabled={recording}
          style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',border:'none',borderRadius:6,cursor:recording?'default':'pointer',fontSize:11,fontWeight:700,background:pickerActive?'#7f1d1d':'#dc2626',color:'#fff',transition:'background .2s',flexShrink:0,letterSpacing:'0.01em',opacity:recording?0.4:1}}>
          <span style={{fontSize:14,lineHeight:1,fontWeight:900}}>{pickerActive?'⏹':'↖'}</span>
          {pickerActive?'Stop':'Inspect'}
        </button>
        {/* Record button — single dark-maroon dot */}
        <button onClick={toggleRecording} title={recording?'Stop recording':'Record user actions as Playwright code'}
          disabled={pickerActive}
          style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',border:'none',borderRadius:6,cursor:pickerActive?'default':'pointer',fontSize:11,fontWeight:700,background:recording?'#166534':'#374151',color:recording?'#bbf7d0':'#9ca3af',transition:'all .2s',flexShrink:0,opacity:pickerActive?0.4:1}}>
          <span style={{fontSize:11,lineHeight:1,color:recording?'#ef4444':'#881337',animation:recording?'rec-blink 1s infinite':'none'}}>●</span>
          {recording?'Stop':'Rec'}
        </button>
        <span style={{fontWeight:800,fontSize:13,flex:1,letterSpacing:'-0.3px',textAlign:'center'}}>⚡ Playwright Guru</span>
        <select value={pwLang} onChange={e=>{setPwLang(e.target.value as PwLang);void browser.storage.local.set({pg_pw_lang:e.target.value});}}
          style={{fontSize:10,background:'#374151',color:'#fff',border:'none',borderRadius:4,padding:'3px 5px',cursor:'pointer'}}>
          {LANGS.map(l=><option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </div>

      {/* Recording pulse animation */}
      <style>{`@keyframes rec-blink{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>

      {/* Recording status banner */}
      {recording && (
        <div style={{padding:'5px 12px',background:'#166534',color:'#bbf7d0',fontSize:10,fontWeight:700,display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
          <span style={{animation:'rec-blink 1s infinite',fontSize:12}}>●</span>
          RECORDING — perform actions on the page
          <span style={{marginLeft:'auto',background:'#14532d',borderRadius:4,padding:'1px 8px'}}>{recordedActions.length} action{recordedActions.length!==1?'s':''}</span>
        </div>
      )}

      {statusMsg && (
        <div style={{padding:'4px 12px',fontSize:11,fontWeight:500,textAlign:'center',flexShrink:0,background:statusOk?'#f0fdf4':'#fef2f2',color:statusOk?'#16a34a':'#dc2626',borderBottom:'1px solid '+(statusOk?'#bbf7d0':'#fecaca')}}>
          {statusMsg}
        </div>
      )}

      {/* 2. Main strategy tabs */}
      <div style={{display:'flex',background:'#fff',borderBottom:'2px solid #e2e8f0',flexShrink:0}}>
        {([['playwright','⭐ Playwright','#16a34a'],['css','{ } CSS','#2563eb'],['xpath','≡ XPath','#d97706']] as const).map(([tab,label,accent])=>(
          <button key={tab} onClick={()=>setMainTab(tab)} style={{flex:1,padding:'7px 4px',border:'none',cursor:'pointer',fontSize:10,fontWeight:700,background:mainTab===tab?'#fff':'#f8fafc',color:mainTab===tab?accent:'#64748b',borderBottom:mainTab===tab?`2px solid ${accent}`:'2px solid transparent',marginBottom:-2}}>
            {label}
          </button>
        ))}
      </div>

      {/* 3. Action strip — shared across all tabs */}
      {pick && (
        <div style={{padding:'6px 10px',background:'#fff',borderBottom:'1px solid #e2e8f0',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:actionDef.hint?3:0}}>
            <code style={{fontSize:9,background:'#f1f5f9',color:'#475569',padding:'2px 5px',borderRadius:3,fontFamily:'Consolas,monospace',flexShrink:0}}>
              &lt;{pick.attributes.tagName}{pick.attributes.type?`[${pick.attributes.type}]`:''}&gt;
            </code>
            <span style={{fontSize:10,color:'#64748b',flexShrink:0}}>Action:</span>
            <select value={actionIsValid?actionMode:'none'} onChange={e=>setActionMode(e.target.value)}
              style={{fontSize:10,padding:'3px 5px',border:'1px solid #e2e8f0',borderRadius:4,background:actionMode==='none'?'#f8fafc':'#eff6ff',color:'#1e293b',cursor:'pointer',flex:1}}>
              {availableActions.map(a=><option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
          {actionDef.hint && (
            <div style={{fontSize:10,color:'#2563eb',paddingLeft:2,display:'flex',gap:4}}>
              <span style={{color:'#94a3b8',flexShrink:0}}>ℹ</span><span>{actionDef.hint}</span>
            </div>
          )}
        </div>
      )}

      {/* Scrollable content */}
      <div style={{overflowY:'auto',flexShrink:0}}>

        {/* Empty state */}
        {!pick && (
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:32,gap:10,color:'#94a3b8',textAlign:'center',minHeight:200}}>
            <div style={{fontSize:40}}>🎯</div>
            <div style={{fontWeight:700,fontSize:14,color:'#64748b'}}>Ready to inspect</div>
            <div style={{fontSize:11}}>Click the <strong style={{color:'#16a34a'}}>🎯 pick button</strong> above, then click any element on the page</div>
          </div>
        )}

        {pick && (
          <>
            {/* ── ELEMENT HTML — pinned above locator cards ── */}
            {pick.outerHtml && (
              <details style={{margin:'8px 8px 4px',border:'1px solid #e2e8f0',borderRadius:8,overflow:'hidden'}}>
                <summary style={{padding:'6px 10px',fontSize:10,fontWeight:700,color:'#64748b',cursor:'pointer',listStyle:'none',textTransform:'uppercase',letterSpacing:'.05em',display:'flex',justifyContent:'space-between',userSelect:'none',background:'#f8fafc'}}>
                  <span>Element HTML</span><span style={{fontWeight:400,fontSize:9}}>click to expand</span>
                </summary>
                <code style={{display:'block',fontFamily:'Consolas,monospace',fontSize:10,color:'#475569',background:'#f1f5f9',padding:'6px 10px',whiteSpace:'pre-wrap',wordBreak:'break-all',lineHeight:1.5}}>{pick.outerHtml}</code>
              </details>
            )}

            {/* ── VERIFY SELECTOR — indigo accent card ── */}
            <div style={{padding:'8px 10px',margin:'0 8px 6px',border:'2px solid #7c3aed',borderRadius:8,background:'#f5f3ff',boxShadow:'0 2px 8px rgba(124,58,237,0.18)'}}>
              <div style={{fontSize:10,fontWeight:700,color:'#5b21b6',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:5,display:'flex',alignItems:'center',gap:4}}>
                <span style={{display:'inline-block',width:6,height:6,borderRadius:'50%',background:'#7c3aed'}}/>
                Verify Selector
              </div>
              <div style={{display:'flex',gap:5}}>
                <input value={verifyInput} onChange={e=>{setVerifyInput(e.target.value);setVerifyResult(null);}}
                  onKeyDown={e=>e.key==='Enter'&&void handleVerify()}
                  placeholder="Type CSS or XPath then press Enter…"
                  style={{flex:1,padding:'4px 8px',fontSize:10,border:'1.5px solid #a78bfa',borderRadius:4,fontFamily:'Consolas,monospace',background:'#fff',color:'#1e1b4b',outline:'none'}}/>
                <button onClick={()=>void handleVerify()} disabled={verifying} style={{padding:'4px 10px',borderRadius:4,border:'none',cursor:'pointer',fontSize:10,fontWeight:700,background:'#7c3aed',color:'#fff',boxShadow:'0 2px 6px rgba(124,58,237,0.4)'}}>▶</button>
              </div>
              {verifyResult && (
                <div style={{marginTop:5,fontSize:10,fontWeight:600,color:verifyColor,paddingLeft:2}}>
                  {verifyResult.error?`⚠ ${verifyResult.error}`:verifyResult.count===1?'✓ 1 element matched — unique!':verifyResult.count===0?'✗ No elements matched':`⚠ ${verifyResult.count} elements matched`}
                </div>
              )}
            </div>

            {/* ── ⭐ PLAYWRIGHT tab: Card 1 ─────────────────────────────── */}
            {mainTab==='playwright' && (
              <div style={{margin:'8px',border:'1px solid #e2e8f0',borderRadius:8,overflow:'hidden',background:'#fff'}}>
                <div style={{padding:'5px 10px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:9,fontWeight:700,color:'#475569'}}>⭐ ALL 7 PLAYWRIGHT LOCATOR TYPES</span>
                  <span style={{fontSize:9,color:'#16a34a',fontWeight:600}}>
                    {Array.from(byKind.values()).flat().filter(c=>c.uniqueCount===1).length} unique
                  </span>
                </div>
                <div style={{overflowY:'auto',maxHeight:196}}>
                  {ALL_GETBY_KINDS.map(({kind,label,naReason})=>{
                    const cands=(byKind.get(kind)??[]).filter(c=>c.uniqueCount!==0);
                    if (cands.length===0) return <NARow key={kind} label={label} reason={naReason}/>;
                    return cands.map((c,i)=>(
                      <LocatorRow key={`${kind}-${i}-${pwLang}-${effectiveAction}`} candidate={c} code={genCode(c)} action={effectiveAction} lang={pwLang} onAdd={appendToCode}/>
                    ));
                  })}
                </div>
              </div>
            )}

            {/* ── { } CSS tab: Card 2 with sub-tabs ─────────────────────── */}
            {mainTab==='css' && (
              <div style={{margin:'8px',border:'1px solid #e2e8f0',borderRadius:8,overflow:'hidden',background:'#fff'}}>
                <div style={{padding:'5px 10px',background:'#eff6ff',borderBottom:'1px solid #bfdbfe',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:9,fontWeight:700,color:'#1e40af'}}>≡ page.locator() CSS VARIANTS</span>
                  <span style={{fontSize:9,color:'#94a3b8'}}>{cssFiltered.length} shown · {allCSSVariants.length} total</span>
                </div>
                {cssResult && (
                  <div style={{padding:'8px 10px',background:'#f0f9ff',borderBottom:'1px solid #e2e8f0',display:'flex',alignItems:'center',gap:6}}>
                    <span style={{fontSize:9,fontWeight:700,color:'#64748b'}}>Best:</span>
                    <code style={{fontFamily:'Consolas,monospace',fontSize:11,color:'#0c4a6e',flex:1,background:'#e0f2fe',padding:'2px 6px',borderRadius:3}}>{cssResult.selector}</code>
                    <CopyBtn text={cssResult.selector}/>
                  </div>
                )}
                <SubTabBar tabs={CSS_SUB_TABS} active={cssSubTab} onSelect={setCssSubTab} accent="#2563eb"/>
                <div style={{overflowY:'auto',maxHeight:196}}>
                  {cssFiltered.length===0
                    ? <div style={{padding:'16px',fontSize:11,color:'#94a3b8',textAlign:'center'}}>No {cssSubTab} selectors generated for this element.</div>
                    : cssFiltered.map((v,i)=><CSSRow key={i} variant={v} lang={pwLang} action={effectiveAction} onAdd={appendToCode}/>)
                  }
                </div>
              </div>
            )}

            {/* ── ≡ XPATH tab: Card 3 with sub-tabs ─────────────────────── */}
            {mainTab==='xpath' && (
              <>
                <div style={{background:'#fef3c7',color:'#92400e',padding:'4px 12px',fontSize:10,fontWeight:600,flexShrink:0}}>
                  ⚠ Playwright recommends semantic locators (getByRole, getByLabel) or CSS over XPath. Use XPath only as last resort.
                </div>
                <div style={{margin:'8px',border:'1px solid #fcd34d',borderRadius:8,overflow:'hidden',background:'#fff'}}>
                  <div style={{padding:'5px 10px',background:'#fffbeb',borderBottom:'1px solid #fcd34d',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:9,fontWeight:700,color:'#92400e'}}>⋔ page.locator() XPATH SYNTAXES</span>
                    <span style={{fontSize:9,color:'#94a3b8'}}>{xpathFiltered.length} shown · {allXPathVariants.length} total</span>
                  </div>
                  {xpathResult && (
                    <div style={{padding:'8px 10px',background:'#fffbeb',borderBottom:'1px solid #fcd34d',display:'flex',alignItems:'center',gap:6}}>
                      <span style={{fontSize:9,fontWeight:700,color:'#64748b'}}>Best:</span>
                      <code style={{fontFamily:'Consolas,monospace',fontSize:11,color:'#78350f',flex:1,background:'#fef9c3',padding:'2px 6px',borderRadius:3}}>{xpathResult.xpath}</code>
                      <CopyBtn text={xpathResult.xpath}/>
                    </div>
                  )}
                  <SubTabBar tabs={XPATH_SUB_TABS} active={xpathSubTab} onSelect={setXpathSubTab} accent="#d97706"/>
                  <div style={{overflowY:'auto',maxHeight:196}}>
                    {xpathFiltered.length===0
                      ? <div style={{padding:'16px',fontSize:11,color:'#94a3b8',textAlign:'center'}}>No {xpathSubTab} XPath variants generated for this element.</div>
                      : xpathFiltered.map((v,i)=><XPathRow key={i} variant={v} lang={pwLang} action={effectiveAction} onAdd={appendToCode}/>)
                    }
                  </div>
                </div>
              </>
            )}

          </>
        )}

      </div>
      {/* CODE section — anchored at footer */}
      <div style={{borderTop:'3px solid #f97316',background:'#1e1e1e',flex:1,minHeight:80,display:'flex',flexDirection:'column'}}>
          <div style={{padding:'6px 10px',display:'flex',alignItems:'center',gap:5,borderBottom:'1px solid #333',background:'#252526'}}>
            <span style={{fontSize:11,fontWeight:800,color:'#d4d4d4',letterSpacing:'.05em',flex:1}}>CODE</span>
            <span style={{fontSize:9,color:'#858585'}}>{codeBuffer.length} line{codeBuffer.length!==1?'s':''}</span>
            <button onClick={()=>void copyAll()} disabled={!codeBuffer.length} style={{fontSize:9,padding:'2px 8px',border:'none',borderRadius:3,cursor:codeBuffer.length?'pointer':'default',background:allCopied?'#16a34a':'#007acc',color:'#fff',fontWeight:700,opacity:codeBuffer.length?1:0.4}}>
              {allCopied?'✓ Copied!':'📋 Copy All'}
            </button>
            <button onClick={undoLast} disabled={!canUndo} style={{fontSize:9,padding:'2px 8px',border:'1px solid #555',borderRadius:3,cursor:canUndo?'pointer':'default',background:'transparent',color:canUndo?'#d4d4d4':'#555',fontWeight:700}}>↩ Undo</button>
            <button onClick={clearCode} disabled={!codeBuffer.length} style={{fontSize:9,padding:'2px 8px',border:'1px solid #c0392b',borderRadius:3,cursor:codeBuffer.length?'pointer':'default',background:'transparent',color:'#e87171',fontWeight:700,opacity:codeBuffer.length?1:0.4}}>Clear</button>
          </div>
          {codeBuffer.length===0
            ? <div style={{padding:'14px 14px',fontSize:11,color:'#4a4a4a',fontFamily:'Consolas,monospace'}}><span style={{color:'#6a9955'}}>// Click </span><span style={{color:'#569cd6'}}>+ Code</span><span style={{color:'#6a9955'}}> on any locator above to build your script</span></div>
            : <div style={{maxHeight:200,overflowY:'auto',padding:'6px 0'}}>
                {codeBuffer.map((line,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'flex-start',padding:'1px 8px',transition:'background .1s'}}
                    onMouseEnter={e=>(e.currentTarget.style.background='#2a2d2e')}
                    onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <span style={{color:'#5a5a5a',userSelect:'none',flexShrink:0,width:22,textAlign:'right',paddingRight:10,fontSize:10,paddingTop:2,fontFamily:'Consolas,monospace'}}>{i+1}</span>
                    <span style={{flex:1,color:'#ce9178',wordBreak:'break-all',fontFamily:'"Fira Code",Consolas,monospace',fontSize:11,lineHeight:1.7}}>{line}</span>
                    <button onClick={()=>removeLine(i)} style={{fontSize:10,background:'transparent',border:'none',color:'#6b7280',cursor:'pointer',padding:'2px 4px',flexShrink:0,borderRadius:3}}
                      onMouseEnter={e=>{e.currentTarget.style.color='#e87171';}} onMouseLeave={e=>{e.currentTarget.style.color='#6b7280';}}>✕</button>
                  </div>
                ))}
              </div>
          }
      </div>
    </div>
  );
}
