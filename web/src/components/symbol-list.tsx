import {useState} from 'react';
import {alphabetIssue} from '../lib/alphabet';
import {Icon} from './icon';

export function SymbolList({label, symbols, onChange}: {label: string; symbols: string[]; onChange: (symbols: string[]) => void}) {
  const [entryError, setEntryError] = useState('');
  const issue = entryError || (symbols.every(Boolean) ? alphabetIssue(symbols, label) : '');
  return <fieldset className="symbol-list"><legend>{label}</legend>
    <div className="symbol-entries">{symbols.map((symbol, index) => <div className="symbol-entry" key={index}>
      <input aria-label={`${label} symbol ${index + 1}`} aria-invalid={Boolean(issue)} required value={symbol} placeholder="Symbol" autoComplete="off" spellCheck={false} onChange={event => {
        const value = event.target.value;
        if (Array.from(value).length > 1) {setEntryError('Use one character per symbol.'); return;}
        setEntryError(''); onChange(symbols.map((current, i) => i === index ? value : current));
      }} />
      <button className="icon-button" type="button" title={`Remove symbol ${index + 1}`} aria-label={`Remove ${label.toLowerCase()} symbol ${index + 1}`} onClick={() => {setEntryError(''); onChange(symbols.filter((_, i) => i !== index));}}><Icon name="close" size={12} /></button>
    </div>)}<button className="icon-button symbol-add" type="button" title={`Add ${label.toLowerCase()} symbol`} aria-label={`Add ${label.toLowerCase()} symbol`} onClick={() => {setEntryError(''); onChange([...symbols, '']);}}><Icon name="plus" size={14} /></button></div>
    {symbols.length === 0 && <span className="symbol-hint">No symbols</span>}
    {issue && <p className="inline-error" role="alert">{issue}</p>}
  </fieldset>;
}
