import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function AtlasSelect({ label, value, options, onChange, placeholder }: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return <label className="atlas-select-field">
    <span>{label}</span>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="atlas-select-trigger"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent className="atlas-select-content" position="popper">
        {options.map((option) => <SelectItem key={option.value} value={option.value} className="atlas-select-item">{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  </label>;
}
