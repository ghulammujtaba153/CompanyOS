"use client"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "cn"

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

export function OptionSelect<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T
  options: readonly T[]
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next && options.includes(next as T)) onChange(next as T)
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Select whose values differ from their labels (ids → names, filter keys → text). */
export function KeyedSelect({
  value,
  onChange,
  options,
  className,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  options: ReadonlyArray<readonly [string, string]>
  className?: string
  disabled?: boolean
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== null && next !== undefined) onChange(next as string)
      }}
      items={Object.fromEntries(options)}
    >
      <SelectTrigger className={cn("w-auto min-w-32", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([optionValue, label]) => (
          <SelectItem key={optionValue} value={optionValue}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
