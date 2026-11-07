"use client";

import {
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ChevronDownIcon } from "./icons";
import styles from "./Form.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export interface FieldProps {
  label: ReactNode;
  /** The id of the control the label names. */
  htmlFor?: string;
  hint?: ReactNode;
  /** Label and control on one line (label left, control right). */
  inline?: boolean;
  className?: string;
  children: ReactNode;
}

/** A label above a control, with an optional hint below. */
export function Field({ label, htmlFor, hint, inline, className, children }: FieldProps) {
  return (
    <div className={cx(styles.field, inline && styles.fieldInline, className)}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <div className={styles.hint}>{hint}</div>}
    </div>
  );
}

type ControlSize = "sm" | "md";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: ControlSize;
  mono?: boolean;
}

/** A text, number or search input. */
export function Input({ size = "md", mono, className, ...rest }: InputProps) {
  return <input className={cx(styles.control, size === "sm" && styles.sm, mono && styles.mono, className)} {...rest} />;
}

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  mono?: boolean;
}

export function TextArea({ mono, className, ...rest }: TextAreaProps) {
  return <textarea className={cx(styles.control, styles.textarea, mono && styles.mono, className)} {...rest} />;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: ControlSize;
}

/** A native select (keeps keyboard and screen-reader behaviour) with the app's look. */
export function Select({ size = "md", className, children, ...rest }: SelectProps) {
  return (
    <span className={cx(styles.selectWrap, className)}>
      <select className={cx(styles.control, styles.select, size === "sm" && styles.sm)} {...rest}>
        {children}
      </select>
      <ChevronDownIcon className={styles.selectChevron} size={14} />
    </span>
  );
}

export interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "min" | "max"> {
  value: number;
  min: number;
  max: number;
}

/** A range input whose track fills up to the value in the accent colour. */
export function Slider({ value, min, max, className, style, ...rest }: SliderProps) {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      className={cx(styles.slider, className)}
      min={min}
      max={max}
      value={value}
      style={{ "--fill": `${fill}%`, ...style } as CSSProperties}
      {...rest}
    />
  );
}

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
}

/** An on/off option. It is a real checkbox (role "checkbox"), drawn as a switch. */
export function Switch({ label, className, disabled, ...rest }: SwitchProps) {
  return (
    <label className={cx(styles.switch, disabled && styles.switchDisabled, className)}>
      {/* The real input lies (transparent) over the drawn track, so pointer and test clicks land on it. */}
      <span className={styles.switchBox}>
        <input type="checkbox" className={styles.switchInput} disabled={disabled} {...rest} />
        <span className={styles.track} aria-hidden>
          <span className={styles.thumb} />
        </span>
      </span>
      <span>{label}</span>
    </label>
  );
}
