"use client";

import { useState } from "react";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupIcon,
  InputGroupInput,
  InputGroupSelect,
  InputGroupSwitch,
} from "@/components/ui/input-group";
import { SearchIcon } from "@/components/ui/icons";

const STATES = ["Default", "Filled", "Focused", "Disabled"] as const;
type State = (typeof STATES)[number];

const CODES = [
  { value: "US", label: "US" },
  { value: "GB", label: "GB" },
  { value: "NG", label: "NG" },
];
const CURRENCIES = [
  { value: "USD", label: "USD" },
  { value: "GBP", label: "GBP" },
  { value: "NGN", label: "NGN" },
];
const COUNTRIES = [
  { value: "NGN", label: "NGN", icon: <span>🇳🇬</span> },
  { value: "USD", label: "USD", icon: <span>🇺🇸</span> },
  { value: "GBP", label: "GBP", icon: <span>🇬🇧</span> },
];

/**
 * Every type and state of the Input Field (Figma 191:21125), live: each field works, so the
 * states can also be reached by typing, focusing and tabbing ("Focused" shows when you click
 * into a field).
 */
export function InputFieldShowcase() {
  return (
    <div className="grid gap-x-16 gap-y-10 md:grid-cols-2 xl:grid-cols-3">
      <Column title="Default">
        {STATES.map((state) => (
          <Row key={state} state={state} label="Phone Number">
            {(id, props) => <Input id={id} placeholder="1000" {...props} />}
          </Row>
        ))}
      </Column>
      <Column title="Leading Icon">
        {STATES.map((state) => (
          <Row key={state} state={state} label="Property Title">
            {(id, props) => (
              <InputGroup>
                <InputGroupIcon>
                  <SearchIcon />
                </InputGroupIcon>
                <InputGroupInput id={id} placeholder="Country" {...props} />
              </InputGroup>
            )}
          </Row>
        ))}
      </Column>
      <Column title="Leading Dropdown">
        {STATES.map((state) => (
          <Row key={state} state={state} label="Phone Number">
            {(id, props) => (
              <WithSelect options={CODES} initial="US">
                {(select) => (
                  <InputGroup focus="field">
                    <InputGroupSelect
                      side="start"
                      label="Country code"
                      disabled={props.disabled}
                      {...select}
                    />
                    <InputGroupInput
                      id={id}
                      placeholder="+1 (555) 000-0000"
                      {...props}
                    />
                  </InputGroup>
                )}
              </WithSelect>
            )}
          </Row>
        ))}
      </Column>
      <Column title="Trailing Dropdown">
        {STATES.map((state) => (
          <Row key={state} state={state} label="Phone Number">
            {(id, props) => (
              <WithSelect options={CURRENCIES} initial="USD">
                {(select) => (
                  <InputGroup>
                    <InputGroupIcon>$</InputGroupIcon>
                    <InputGroupInput id={id} placeholder="1000" {...props} />
                    <InputGroupSelect
                      side="end"
                      label="Currency"
                      disabled={props.disabled}
                      {...select}
                    />
                  </InputGroup>
                )}
              </WithSelect>
            )}
          </Row>
        ))}
      </Column>
      <Column title="Country">
        {STATES.map((state) => (
          <Row key={state} state={state} label="Country">
            {(id, props) => (
              <WithSelect options={COUNTRIES} initial="NGN">
                {(select) => (
                  <InputGroup focus="field">
                    <InputGroupSelect
                      side="start"
                      label="Currency"
                      disabled={props.disabled}
                      {...select}
                    />
                    <InputGroupInput
                      id={id}
                      placeholder="Select country"
                      {...props}
                    />
                  </InputGroup>
                )}
              </WithSelect>
            )}
          </Row>
        ))}
      </Column>
      <Column title="Toggle">
        {(["Default", "Active"] as const).map((state) => (
          <Field key={state}>
            <FieldLabel htmlFor={`toggle-${state}`}>
              {state === "Default" ? "Phone Number" : "Property Title"}
            </FieldLabel>
            <InputGroup>
              <InputGroupInput id={`toggle-${state}`} defaultValue="1000" />
              <InputGroupSwitch
                aria-label="Use this"
                defaultChecked={state === "Active"}
              />
            </InputGroup>
            <span className="text-type-caption-2 text-sub-text">{state}</span>
          </Field>
        ))}
      </Column>
    </div>
  );
}

function Column({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex w-full max-w-80 flex-col gap-6">
      <h2 className="text-type-caption-1 font-medium text-sub-text">{title}</h2>
      {children}
    </section>
  );
}

type FieldProps = {
  defaultValue?: string;
  disabled?: boolean;
  autoFocus?: boolean;
};

function Row({
  state,
  label,
  children,
}: {
  state: State;
  label: string;
  children: (id: string, props: FieldProps) => React.ReactNode;
}) {
  const id = `${label}-${state}`.replace(/\W+/g, "-").toLowerCase();
  const props: FieldProps =
    state === "Default"
      ? {}
      : state === "Disabled"
        ? { disabled: true }
        : { defaultValue: "1000" };
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children(id, props)}
      <span className="text-type-caption-2 text-sub-text">{state}</span>
    </Field>
  );
}

function WithSelect({
  options,
  initial,
  children,
}: {
  options: { value: string; label: string; icon?: React.ReactNode }[];
  initial: string;
  children: (select: {
    value: string;
    options: typeof options;
    onValueChange: (value: string) => void;
  }) => React.ReactNode;
}) {
  const [value, setValue] = useState(initial);
  return children({ value, options, onValueChange: setValue });
}
